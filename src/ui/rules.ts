import { getSection, getCatalogField } from '../shared/field-catalog';
import { formatTimestamp } from '../shared/dates';
import { byId, clear, describeError, el, on, send, toast, type StateView } from './common';

/** 修正规则列表：网站、表单结构、网页标签、源字段、更新时间；可删除。 */

function selectorText(selector: StateView['mappings'][number]['recordSelector']): string {
  switch (selector.kind) {
    case 'single':
      return '单值字段';
    case 'degree':
      return `按学历层级：${selector.level}`;
    case 'record':
      return `指定经历：${selector.recordId}`;
  }
}

export function renderRules(state: StateView, reload: () => void): void {
  const host = byId('view-rules');
  clear(host);

  host.append(
    el('div', { class: 'panel-head' }, [
      el('h2', { text: '字段对应规则' }),
      el('p', { class: 'muted', text: '规则只保存「网页字段 ↔ 履历字段」的对应关系，不保存任何具体内容。结构变化后规则会自动失效。' }),
    ]),
  );

  const list = el('section', { class: 'card', id: 'rule-list' }, [
    el('h3', { text: `已保存 ${state.mappings.length} 条规则` }),
  ]);
  if (state.mappings.length === 0) {
    list.append(el('p', { class: 'empty', text: '还没有规则。在结果页把一个陌生字段对应到履历字段并勾选「记住」即可创建。' }));
  }

  for (const rule of state.mappings) {
    const section = getSection(rule.section);
    const field = getCatalogField(rule.section, rule.sourceField);
    const row = el('div', { class: 'record', 'data-rule-id': rule.id }, [
      el('div', { class: 'record-head' }, [
        el('strong', { text: rule.fieldLabel }),
        el('span', { class: 'field-meta', text: `${rule.origin}${rule.routeKey}` }),
      ]),
      el('p', {
        text: `对应到：${section?.label ?? rule.section} / ${field?.label ?? rule.sourceField} · ${selectorText(rule.recordSelector)}`,
      }),
      el('p', {
        class: 'muted',
        text: `控件：${rule.controlKind} · 表单结构 ${rule.formFingerprint} · 更新于 ${formatTimestamp(rule.updatedAt, state.settings.timezone)}`,
      }),
    ]);
    const remove = el('button', { type: 'button', class: 'tiny', text: '删除规则' });
    on(remove, 'click', () => {
      void send('DELETE_MAPPING', { mappingId: rule.id, expectedRevision: state.revision })
        .then(() => {
          toast('规则已删除', 'success');
          reload();
        })
        .catch((error: unknown) => toast(describeError(error), 'error'));
    });
    row.append(el('div', { class: 'record-buttons' }, [remove]));
    list.append(row);
  }
  host.append(list);
}
