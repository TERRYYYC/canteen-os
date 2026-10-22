/**
 * ADR-0011: the fixed record sent to the KB when a candidate is saved or set aside; it states that no one reviewed it in the app.
 * Shared by the inbox and the plan page's Add form (#202), so both save a candidate the same way.
 */
export const SYSTEM_REVIEWER='CanteenOS：直接存为菜谱（复核在 app 外，ADR-0011）';
export const SYSTEM_NOTE='app 里没有人审核来源；复核在 app 外进行。';
