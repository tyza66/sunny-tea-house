import { resolveLanguage } from './languages.js';

// 公共演示模板不包含密钥、网络请求或服务端依赖。
export const TAGS = ['服务好', '出餐快', '环境干净', '饮品颜值高', '果肉超丰富', '茶香浓郁'];

// 每个感受在各语言下的自然说法。演示文案按“平台声音”分别准备，
// 避免两个平台读起来是同一种腔调，也避免逐条罗列标签。
// 小红书版本额外控制在 150 个 Unicode 字符内，与服务端提示词的限制一致。
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
      '服务好': 'the staff are so warm', '出餐快': 'my order came out fast',
      '环境干净': 'the place is clean and comfy', '饮品颜值高': 'the drink looks amazing',
      '果肉超丰富': 'so much real fruit pulp', '茶香浓郁': 'the tea is rich and smooth',
    },
  },
  'fr-CA': {
    Google: {
      '服务好': 'le personnel était attentionné et patient', '出餐快': 'la commande est arrivée vite, presque sans attente',
      '环境干净': "l'endroit était propre et confortable", '饮品颜值高': 'la boisson était jolie dans son verre',
      '果肉超丰富': 'il y avait beaucoup de vraie pulpe de fruits', '茶香浓郁': "le thé avait un arôme riche et naturel",
    },
    小红书: {
      '服务好': 'le personnel est attentionné', '出餐快': 'la commande est arrivée vite',
      '环境干净': 'l’endroit est propre', '饮品颜值高': 'la boisson est jolie',
      '果肉超丰富': 'beaucoup de pulpe de fruits', '茶香浓郁': 'le thé est bien parfumé',
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
      '环境干净': 'el local está limpio', '饮品颜值高': 'la bebida se ve preciosa',
      '果肉超丰富': 'mucha pulpa de fruta', '茶香浓郁': 'el té es aromático y suave',
    },
  },
};

// 平台外壳：开头与结尾按平台与语言分别设定；${name} 与 ${city} 是占位符。
// gap 是开头与第一句之间的间隔：中文不需要，拉丁语系需要一个空格。
// 开头 3 种、结尾 2 种，同一组选择重复生成时轮换出现，演示不会读起来像固定文案。
const SHELL = {
  Google: {
    'zh-CN': {
      gap: '', sep: '，',
      head: ['在${city}的${name}坐了一会。', '周末路过${city}，在${name}歇了一会脚。', '今天在${city}的${name}喝了一杯。'],
      tail: ['。整体是一次舒服的消费。', '。会想再来一次。'],
    },
    'zh-TW': {
      gap: '', sep: '，',
      head: ['在${city}的${name}坐了一會。', '週末路過${city}，在${name}歇了一會腳。', '今天在${city}的${name}喝了一杯。'],
      tail: ['。整體是一次舒服的消費。', '。會想再來一次。'],
    },
    en: {
      gap: ' ', sep: ', and ',
      head: ['Stopped in at ${name} in ${city}.', 'Swing by ${name} in ${city} after work.', 'Tried ${name} in ${city} this weekend.'],
      tail: ['. A solid, low-key spot for a relaxed tea run.', '. Easy to recommend for a quick tea break.'],
    },
    'fr-CA': {
      gap: ' ', sep: ', et ',
      head: ['Passage chez ${name} à ${city}.', 'Arrêt chez ${name} à ${city} en fin de journée.', 'Essayé ${name} à ${city} cette fin de semaine.'],
      tail: ['. Une bonne adresse pour un thé tranquille.', '. À recommander pour une pause thé.'],
    },
    es: {
      gap: ' ', sep: ', y ',
      head: ['Pasé por ${name} en ${city}.', 'Me pasé por ${name} en ${city} después del trabajo.', 'Probé ${name} en ${city} este fin de semana.'],
      tail: ['. Un buen sitio para un té tranquilo.', '. Recomendable para una pausa tranquila.'],
    },
  },
  小红书: {
    'zh-CN': {
      gap: '', sep: '，',
      head: ['🧋 ${name} 探店\n\n', '🧋 ${name}｜这一杯有点东西\n\n', '🧋 ${city}探店｜${name}\n\n'],
      tail: ['。✨\n\n嘴馋的时候来一杯，很舒服。', '。✨\n\n下次来${city}还会想来一杯。'],
    },
    'zh-TW': {
      gap: '', sep: '，',
      head: ['🧋 ${name} 探店\n\n', '🧋 ${name}｜這一杯有點東西\n\n', '🧋 ${city}探店｜${name}\n\n'],
      tail: ['。✨\n\n嘴饞的時候來一杯，很舒服。', '。✨\n\n下次來${city}還會想來一杯。'],
    },
    en: {
      gap: '', sep: ', and ',
      head: ['🧋 ${name} · ${city}\n\n', '🧋 ${name} in ${city}\n\n', '🧋 ${city} tea run — ${name}\n\n'],
      tail: ['. 💛\n\nWorth a stop nearby ✨', '. 💛\n\nWould come back next time ✨'],
    },
    'fr-CA': {
      gap: '', sep: ' et ',
      head: ['🧋 ${name} · ${city}\n\n', '🧋 ${name} à ${city}\n\n', '🧋 ${city} — ${name}\n\n'],
      tail: ['. 💛\n\nÀ essayer si vous passez par là ✨', '. 💛\n\nJ’y reviendrai ✨'],
    },
    es: {
      gap: '', sep: ', y ',
      head: ['🧋 ${name} · ${city}\n\n', '🧋 ${name} en ${city}\n\n', '🧋 ${city} — ${name}\n\n'],
      tail: ['. 💛\n\nVale la pena ✨', '. 💛\n\nVolvería la próxima vez ✨'],
    },
  },
};

export const DEMO_VARIANTS = SHELL.Google['zh-CN'].head.length * SHELL.Google['zh-CN'].tail.length;

const fill = (template, store) => template.replaceAll('${name}', store.name).replaceAll('${city}', store.city);

// 拉丁语系句子首字母大写，中文两端都不需要。
const upperFirst = (text, language) => language.startsWith('zh') ? text : text[0].toUpperCase() + text.slice(1);

// 同一组选择连续生成时轮换说法；variant 由测试显式传入，保证断言稳定。
let rotation = 0;
const at = (list, index) => list[index % list.length];

export function demoReview(input, store, variant = rotation++) {
  const language = resolveLanguage(input.language, input.platform);
  const context = `${language}/${input.platform}/${input.tags.join('+')}`;
  const shell = SHELL[input.platform]?.[language];
  const voice = VOICE[language]?.[input.platform];
  // 平台、语言或标签片段缺失时直接报错，而不是悄悄输出空文案。
  const missing = !shell || !voice || !Array.isArray(input.tags) || input.tags.some(tag => typeof voice[tag] !== 'string');
  if (missing) throw new Error(`演示文案缺少语言片段: ${context}`);
  const phrases = input.tags.map(tag => voice[tag]);
  const body = [upperFirst(phrases[0], language), ...phrases.slice(1)].join(shell.sep);
  return `${fill(at(shell.head, variant), store)}${shell.gap}${body}${fill(at(shell.tail, variant), store)}`;
}
