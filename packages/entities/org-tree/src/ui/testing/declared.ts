/**
 * Значения свойства из стилевых правил, подходящих элементу: вне @media или внутри @media с
 * этим условием. jsdom не применяет анимации и media-запросы — проверяется само правило.
 */
export function declared(element: Element, property: string, media?: string): string[] {
  const values: string[] = [];
  const visit = (rules: CSSRuleList, condition: string | undefined) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        visit(rule.cssRules, rule.media.mediaText);
      } else if (
        rule instanceof CSSStyleRule &&
        condition === media &&
        element.matches(rule.selectorText)
      ) {
        // Объявление правила таблицы стилей, а не инлайн-стиль элемента.
        // eslint-disable-next-line no-restricted-syntax
        const value = rule.style.getPropertyValue(property);
        if (value) {
          values.push(value);
        }
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    visit(sheet.cssRules, undefined);
  }
  return values;
}

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
