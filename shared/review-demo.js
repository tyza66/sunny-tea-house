import { resolveLanguage } from './languages.js';

// 公共演示模板不包含密钥、网络请求或服务端依赖。
export const TAGS = ['服务好', '出餐快', '环境干净', '饮品颜值高', '果肉超丰富', '茶香浓郁'];

export function demoReview(input, store) {
  const language = resolveLanguage(input.language, input.platform);
  const text = {
    'zh-CN': ['服务好', '出餐快', '环境干净', '饮品颜值高', '果肉超丰富', '茶香浓郁'],
    'zh-TW': ['服務好', '出餐快', '環境乾淨', '飲品顏值高', '果肉超豐富', '茶香濃郁'],
    en: ['The service was friendly.', 'My order was ready quickly.', 'The space was clean.', 'The drink looked lovely.', 'There was plenty of fruit pulp.', 'The tea had a rich aroma.'],
    'fr-CA': ['Le service était attentionné.', 'Ma commande était prête vite.', 'Le lieu était propre.', 'La boisson était jolie.', 'Il y avait beaucoup de pulpe.', 'Le thé était bien parfumé.'],
    es: ['El servicio fue amable.', 'Mi pedido salió rápido.', 'El local estaba limpio.', 'La bebida se veía bonita.', 'Había mucha pulpa de fruta.', 'El té tenía un rico aroma.'],
  };
  const lines = input.tags.map(tag => text[language][TAGS.indexOf(tag)]);
  if (input.platform === '小红书') {
    if (language === 'zh-CN') return `🧋 ${store.name} 探店小记\n\n这次在 ${store.city} 喝茶，印象最深的是${lines.join('、')}。✨\n\n把这份小小的喝茶感受记录下来。`;
    if (language === 'zh-TW') return `🧋 ${store.name} 探店小記\n\n這次在 ${store.city} 喝茶，印象最深的是${lines.join('、')}。✨\n\n把這份小小的喝茶感受記錄下來。`;
    return `🧋 ${store.name}\n\n${lines.join(' ')} ✨`;
  }
  const intro = { 'zh-CN': `记录一下在 ${store.city} 的 ${store.name} 的体验。`, 'zh-TW': `記錄一下在 ${store.city} 的 ${store.name} 的體驗。`, en: `A note on ${store.name} in ${store.city}.`, 'fr-CA': `Mon avis sur ${store.name} à ${store.city}.`, es: `Mi opinión sobre ${store.name} en ${store.city}.` };
  const ending = { 'zh-CN': '这是这次消费给我留下的印象。', 'zh-TW': '這是這次消費給我留下的印象。', en: 'That stood out during my visit.', 'fr-CA': 'Ce détail m’a marqué pendant ma visite.', es: 'Eso destacó durante mi visita.' };
  return [intro[language], ...lines.map(line => language.startsWith('zh') ? line + '。' : line), ...(lines.length === 1 ? [ending[language]] : [])].join(' ');
}

