import { getCatalogField, getSection, isRepeatedSection, readFieldValue } from '../shared/field-catalog';
import { bindRecords, matchField, type MatchContext, type RecordInstance, type RecordSummary } from '../shared/matching';
import { projectValue } from '../shared/projection';
import type { ScanResult } from '../shared/protocol';
import type {
  FieldDescriptor, FieldRef, FieldResult, FillAction, KnownSection, ProfileData, ProfileFile,
  SavedMapping, SectionKind,
} from '../shared/types';

/** 由扫描结果与履历生成有依据的填写计划。纯函数，便于单元测试。 */

export interface PlanOptions {
  scan: ScanResult;
  profile: ProfileFile;
  rules: SavedMapping[];
  /** 用户本轮手动绑定：fieldId -> FieldRef（不含 recordId）。 */
  manualBindings?: Map<string, Omit<FieldRef, 'recordId'>>;
  /** 允许覆盖已有不同值的字段（必须由用户针对该项发起）。 */
  overwriteFieldIds?: Set<string>;
  /** 只为这些 fieldId 生成动作；为空表示全部。 */
  onlyFieldIds?: Set<string>;
  /** 用户为整组网页经历指定的履历记录：recordInstanceId -> recordId。 */
  userRecordBindings?: Map<string, string>;
}

export interface PlanResult {
  actions: FillAction[];
  results: FieldResult[];
  addRequests: Array<{ section: SectionKind; sectionInstanceId: string; count: number }>;
  recordBindingNotes: string[];
  /** 网页记录数超过履历且整条记录仍为空；详情页会按记录折叠展示。 */
  excessEmptyRecordInstanceIds: string[];
}

const REPEATED_SECTIONS: KnownSection[] = [
  'education', 'workExperiences', 'internships', 'projects', 'languages', 'awards', 'publications', 'certificates',
];

function identityOf(section: KnownSection, record: Record<string, unknown>): string {
  const value = record['school'] ?? record['company'] ?? record['name'] ?? record['language'] ?? '';
  return typeof value === 'string' ? value : '';
}

export function recordSummaries(data: ProfileData, section: KnownSection): RecordSummary[] {
  const list = (data as unknown as Record<string, unknown>)[section];
  if (!Array.isArray(list)) return [];
  return (list as Array<Record<string, unknown>>).map((record) => ({
    id: String(record['id']),
    primary: record['primary'] === true,
    degreeLevel: section === 'education' ? ((record['degreeLevel'] as RecordSummary['degreeLevel']) ?? null) : null,
    identity: identityOf(section, record),
  }));
}

function resultFor(
  descriptor: FieldDescriptor,
  outcome: FieldResult['outcome'],
  reasonCode: FieldResult['reasonCode'],
  source: FieldRef | null = null,
): FieldResult {
  return {
    fieldId: descriptor.fieldId,
    section: descriptor.section,
    source,
    outcome,
    reasonCode,
    label: descriptor.label,
    elapsedMs: 0,
  };
}

export function planRun(options: PlanOptions): PlanResult {
  const { scan, profile } = options;
  const data = profile.data;

  // 1) 重复经历绑定。
  const recordBindings = new Map<string, ReturnType<typeof bindRecords> extends Map<string, infer V> ? V : never>();
  const recordBindingNotes: string[] = [...(scan.diagnostics ?? [])];
  const excessEmptyRecordInstanceIds = new Set<string>();
  const excessCounts = new Map<KnownSection, number>();
  for (const section of REPEATED_SECTIONS) {
    const instances: RecordInstance[] = scan.recordInstances
      .filter((instance) => instance.section === section)
      .map((instance) => ({
        recordInstanceId: instance.recordInstanceId,
        degreeHint: instance.degreeHint,
        identityHint: instance.identityHint,
        order: instance.order,
      }));
    if (instances.length === 0) continue;
    const summaries = recordSummaries(data, section);
    const defaultRecordId = summaries.find((record) => record.primary)?.id;
    const bound = bindRecords(instances, summaries, {
      allowOrderFallback: scan.orderFallbackSections.includes(section),
      ...(defaultRecordId ? { defaultRecordId } : {}),
      ...(options.userRecordBindings ? { userBindings: options.userRecordBindings } : {}),
    });
    for (const [key, value] of bound) {
      recordBindings.set(key, value);
      if (!value.ok) {
        const fields = scan.descriptors.filter((descriptor) => descriptor.recordInstanceId === key);
        const excessEmpty = value.reasonCode === 'SOURCE_MISSING' && fields.length > 0 && fields.every((field) => field.empty);
        if (excessEmpty) {
          excessEmptyRecordInstanceIds.add(key);
          excessCounts.set(section, (excessCounts.get(section) ?? 0) + 1);
        } else {
          recordBindingNotes.push(`${getSection(section)?.label ?? section}：${value.message}`);
        }
      }
    }
  }
  for (const [section, count] of excessCounts) {
    recordBindingNotes.push(
      `${getSection(section)?.label ?? section}：网页多出 ${count} 条完全空白的记录，履历中没有对应经历；详情已按记录折叠，请在网页删除空记录或手动补充。`,
    );
  }

  // 2) 适配器绑定（仍需通过白名单校验）。
  const adapterBindings = new Map<string, Omit<FieldRef, 'recordId'>>();
  for (const binding of scan.adapterBindings) {
    if (binding.section === 'unknown') continue;
    const section = binding.section as KnownSection;
    if (!getCatalogField(section, binding.field)) continue;
    adapterBindings.set(binding.fieldId, { section, field: binding.field });
  }

  const context: MatchContext = {
    data,
    profileId: profile.profileId,
    rules: options.rules,
    adapterBindings,
    manualBindings: options.manualBindings ?? new Map(),
    recordBindings,
  };

  const actions: FillAction[] = [];
  const results: FieldResult[] = [];

  for (const descriptor of scan.descriptors) {
    if (options.onlyFieldIds && !options.onlyFieldIds.has(descriptor.fieldId)) continue;

    if (descriptor.controlKind === 'unsupported') {
      results.push(resultFor(descriptor, 'pending', 'UNSUPPORTED_WIDGET'));
      continue;
    }
    if (descriptor.sensitive) {
      // 敏感信息不进入履历模型，任何情况下都不自动填写。
      results.push(resultFor(descriptor, 'pending', 'REQUIRES_USER_ACTION'));
      continue;
    }
    if (descriptor.disabled || descriptor.readOnly || !descriptor.visible) {
      results.push(resultFor(descriptor, 'pending', 'REQUIRES_USER_ACTION'));
      continue;
    }

    const decision = matchField(descriptor, context);
    if (decision.kind === 'rejected') {
      results.push(resultFor(descriptor, 'pending', decision.reasonCode));
      continue;
    }

    const catalogField = getCatalogField(decision.source.section, decision.source.field);
    if (!catalogField) {
      results.push(resultFor(descriptor, 'pending', 'NO_MATCH', decision.source));
      continue;
    }

    const value = readFieldValue(data, decision.source);
    const projection = projectValue(value, descriptor, catalogField);
    if (!projection.ok) {
      results.push(resultFor(descriptor, 'pending', projection.reasonCode, decision.source));
      continue;
    }

    actions.push({
      fieldId: descriptor.fieldId,
      source: decision.source,
      expectedFingerprint: descriptor.semanticFingerprint,
      kind: descriptor.controlKind,
      value: projection.value,
      overwrite: options.overwriteFieldIds?.has(descriptor.fieldId) ? 'user-approved' : false,
    });
  }

  // “至今”常同时呈现为一个不可填写的结束日期框和一个复选框。复选框已经能
  // 完整表达履历中的 present=true 时，不再把同一来源的空日期框重复列为待处理。
  const presentCheckboxSources = new Set(
    actions
      .filter((action) => action.kind === 'checkbox' && action.value === true)
      .map((action) => `${action.source.section}::${action.source.recordId ?? ''}::${action.source.field}`),
  );
  const checkedPresentRecordInstances = new Set(
    scan.descriptors
      .filter((descriptor) => descriptor.controlKind === 'checkbox' && !descriptor.empty && /至今$/.test(descriptor.normalizedLabel))
      .map((descriptor) => descriptor.recordInstanceId)
      .filter((id): id is string => Boolean(id)),
  );
  const representedResults = results.filter((result) => {
    if (!result.source || result.reasonCode !== 'REQUIRES_USER_ACTION') return true;
    const descriptor = scan.descriptors.find((item) => item.fieldId === result.fieldId);
    if (!descriptor || (descriptor.controlKind !== 'date-picker' && descriptor.controlKind !== 'date' && descriptor.controlKind !== 'month')) {
      return true;
    }
    const key = `${result.source.section}::${result.source.recordId ?? ''}::${result.source.field}`;
    return !presentCheckboxSources.has(key) && !(
      result.source.field === 'endDate' &&
      descriptor.recordInstanceId !== null &&
      checkedPresentRecordInstances.has(descriptor.recordInstanceId)
    );
  });

  // 3) 新增经历：只有适配器提供按钮的分区才请求，且不超过履历实际条数。
  const addRequests: PlanResult['addRequests'] = [];
  for (const action of scan.addActions) {
    if (action.section === 'unknown') continue;
    const section = action.section as KnownSection;
    if (!getSection(section)) continue;
    const selfIntroduction = section === 'selfIntroduction';
    if (!selfIntroduction && !isRepeatedSection(section)) continue;
    const pageCount = selfIntroduction
      ? Number(scan.descriptors.some((descriptor) => descriptor.section === section))
      : scan.recordInstances.filter((instance) => instance.section === section).length;
    const profileCount = selfIntroduction
      ? Number(Boolean(data.selfIntroduction?.trim()))
      : recordSummaries(data, section).length;
    const missing = profileCount - pageCount;
    if (missing > 0) {
      addRequests.push({ section, sectionInstanceId: action.sectionInstanceId, count: selfIntroduction ? 1 : Math.min(missing, 5) });
    }
  }

  return {
    actions,
    results: representedResults,
    addRequests,
    recordBindingNotes,
    excessEmptyRecordInstanceIds: [...excessEmptyRecordInstanceIds],
  };
}
