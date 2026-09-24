import { resolveLanguage } from './languages.js';

// 公共演示模板不包含密钥、网络请求或服务端依赖。
export const TAGS = ['服务好', '出餐快', '环境干净', '饮品颜值高', '果肉超丰富', '茶香浓郁'];

// 每个感受在各语言下的自然说法。演示文案按“平台声音”分别准备，
// 避免两个平台读起来是同一种腔调，也避免逐条罗列标签。
// 注意：键一律使用规范标签名，与展示语言无关。
const VOICE = {
  'zh-CN': {
    Google: {
      '服务好': '店员态度亲切，有问必答', '出餐快': '出餐很快，几乎没等', '环境干净': '店里干净，坐着也舒服',
      '饮品颜值高': '饮品样子挺好看', '果肉超丰富': '果肉给得足', '茶香浓郁': '茶香浓，喝得出层次',
    },
    小红书: {
      '服务好': '服务好贴心，像被认真照顾', '出餐快': '出餐快，不用干等', '环境干净': '环境干净清爽，坐着舒服',
      '饮品颜值高': '饮品颜值在线，很适合拍照', '果肉超丰富': '果肉超丰富，每口都有料', '茶香浓郁': '茶香浓郁，还有回甘',
    },
  },
  'zh-TW': {
    Google: {
      '服务好': '店員態度親切，有問必答', '出餐快': '出餐很快，幾乎沒等', '环境干净': '店裡乾淨，坐著也舒服',
      '饮品颜值高': '飲品樣子挺好看', '果肉超丰富': '果肉給得足', '茶香浓郁': '茶香濃，喝得出層次',
    },
    小红书: {
      '服务好': '服務好貼心，像被認真照顧', '出餐快': '出餐快，不用乾等', '环境干净': '環境乾淨清爽，坐著舒服',
      '饮品颜值高': '飲品顏值在線，很適合拍照', '果肉超丰富': '果肉超豐富，每口都有料', '茶香浓郁': '茶香濃郁，還有回甘',
    },
  },
  en: {
    Google: {
      '服务好': 'the staff were friendly and patient while I picked a drink', '出餐快': 'the order came out quickly, with barely any wait',
      '环境干净': 'the space was clean and easy to settle into', '饮品颜值高': 'the drink itself looked great in the cup',
      '果肉超丰富': 'there was plenty of real fruit pulp', '茶香浓郁': 'the tea had a clean, rich aroma',
    },
    小红书: {
      '服务好': 'the staff were so warm and attentive', '出餐快': 'my order came out super fast',
      '环境干净': 'the place is clean and comfy', '饮品颜值高': 'the drink looks amazing, very photogenic',
      '果肉超丰富': 'the fruit pulp is generous', '茶香浓郁': 'the tea aroma is rich and smooth',
    },
  },
  'fr-CA': {
    Google: {
      '服务好': 'le personnel était attentionné et patient', '出餐快': 'la commande est arrivée vite, presque sans attente',
      '环境干净': "l'endroit était propre et confortable", '饮品颜值高': 'la boisson était jolie dans son verre',
      '果肉超丰富': 'il y avait beaucoup de vraie pulpe de fruits', '茶香浓郁': "le thé avait un arôme riche et naturel",
    },
    小红书: {
      '服务好': 'le personnel est tellement attentionné', '出餐快': 'ma commande est arrivée super vite',
      '环境干净': "l'endroit est propre et confortable", '饮品颜值高': 'la boisson est super jolie',
      '果肉超丰富': 'il y a beaucoup de pulpe de fruits', '茶香浓郁': 'le thé est riche et parfumé',
    },
  },
  es: {
    Google: {
      '服务好': 'el personal fue amable y paciente', '出餐快': 'el pedido salió rápido, sin apenas espera',
      '环境干净': 'el local estaba limpio y cómodo', '饮品颜值高': 'la bebida se veía muy bien',
      '果肉超丰富': 'había mucha pulpa de fruta', '茶香浓郁': 'el té tenía un aroma rico y natural',
    },
    小红书: {
      '服务好': 'el personal es muy amable', '出餐快': 'mi pedido salió rapidísimo',
      '环境干净': 'el local está limpio y cómodo', '饮品颜值高': 'la bebida se ve preciosa',
      '果肉超丰富': 'lleva mucha pulpa de fruta', '茶香浓郁': 'el té es aromático y suave',
    },
  },
};

// 平台外壳：开头、连接词与结尾按平台与语言分别设定；name 与 city 占位符会被替换。
// gap 是开头与第一句之间的间隔：中文不需要，拉丁语系需要一个空格。
const SHELL = {
  Google: {
    'zh-CN': { head: '在${city}的${name}坐了一会。', gap: '', sep: '，', tail: '。整体是一次舒服的消费。' },
    'zh-TW': { head: '在${city}的${name}坐了一會。', gap: '', sep: '，', tail: '。整體是一次舒服的消費。' },
    en: { head: 'Stopped in at ${name} in ${city}.', gap: ' ', sep: ', and ', tail: '. A solid, low-key spot for a relaxed tea run.' },
    'fr-CA': { head: 'Passage chez ${name} à ${city}.', gap: ' ', sep: ', et ', tail: '. Une bonne adresse pour un thé tranquille.' },
    es: { head: 'Pasé por ${name} en ${city}.', gap: ' ', sep: ', y ', tail: '. Un buen sitio para un té tranquillo.' },
  },
  小红书: {
    'zh-CN': { head: '🧋 ${name} 探店\n\n', gap: '', sep: '，', tail: '。✨\n\n嘴馋的时候来一杯，很舒服。' },
    'zh-TW': { head: '🧋 ${name} 探店\n\n', gap: '', sep: '，', tail: '。✨\n\n嘴饞的時候來一杯，很舒服。' },
    en: { head: '🧋 ${name} in ${city}\n\n', gap: '', sep: ', and ', tail: '. 💛\n\nWorth a stop if you are nearby ✨' },
    'fr-CA': { head: '🧋 ${name} à ${city}\n\n', gap: '', sep: ' et ', tail: '. 💛\n\nÀ essayer ✨' },
    es: { head: '🧋 ${name} en ${city}\n\n', gap: '', sep: ' y ', tail: '. 💛\n\nVale la pena ✨' },
  },
};

const fill = (template, store) => template.replaceAll('${name}', store.name).replaceAll('${city}', store.city);

// 拉丁语系句子首字母大写，中文两端都不需要。
const upperFirst = (text, language) => language.startsWith('zh') ? text : text[0].toUpperCase() + text.slice(1);

export function demoReview(input, store) {
  const language = resolveLanguage(input.language, input.platform);
  const context = `${language}/${input.platform}/${input.tags.join('+')}`;
  const shell = SHELL[input.platform]?.[language];
  const voice = VOICE[language]?.[input.platform];
  // 平台、语言或标签片段缺失时直接报错，而不是悄悄输出空文案。
  const missing = !shell || !voice || !Array.isArray(input.tags) || input.tags.some(tag => typeof voice[tag] !== 'string');
  if (missing) throw new Error(`演示文案缺少语言片段: ${context}`);
  const phrases = input.tags.map(tag => voice[tag]);
  const body = [upperFirst(phrases[0], language), ...phrases.slice(1)].join(shell.sep);
  return `${fill(shell.head, store)}${shell.gap}${body}${shell.tail}`;
}
