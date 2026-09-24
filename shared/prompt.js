// 提示词同时被服务端与浏览器端复用：静态托管下评审者自带密钥直连 DeepSeek 时，
// 使用同一份写作约束，保证两种托管方式的生成口径一致。
import { LANGUAGES, resolveLanguage } from './languages.js';

// 平台级“声音”与结构：让 Google 与小红书写出不同口吻；输出语言另由 language 单独控制。
const PLATFORM_VOICE = {
  Google: {
    persona: '角色：你是一位住在北美的真实顾客，正给常去的茶饮店写一条客观、自然的 Google 评价。',
    structure: '结构：用 3–4 个完整的句子写成一段，第一人称。语气自然克制、直白可信；可基于所选感受给出简短判断（是否值得/性价比），但不要夸张。',
    rules: '禁用：标题、Markdown、项目符号、Emoji、感叹号、广告词，以及“强烈推荐”“一定来试试”等套话。不要写成攻略或“打卡”口吻。',
    example: 'Stopped by on a weekday afternoon for an iced tea. The staff were patient when I asked to adjust the sweetness, and the order came out quickly. The tea had a clean, rich aroma that was not overpowering. The space was clean and comfortable enough to sit for a bit.',
  },
  小红书: {
    persona: '角色：你是一位在小红书分享好物的普通用户，正在写一条真实、轻松的种草笔记。',
    structure: '结构：可加一行短标题；正文 1–2 行后分段，留白、有呼吸感，避免一整段没有换行。',
    rules: '长度：全文不超过 150 个 Unicode 字符（含标点、空格与 Emoji）。Emoji：按所选感受适当点缀，例如出餐快⚡️、茶香浓郁🍵✨、环境干净🌿、饮品颜值高🧋💛、果肉超丰富🥭。避免：夸张、无依据的“亲测多次”“无限回购”“必买”；不要写成硬广。',
    example: '🧋 Sunny Tea House 打卡\n\n路过进来歇了会脚，服务很温柔，出餐也麻利。茶香足、回甘自然，颜值在线还很干净，坐着舒服。\n\n适合嘴馋时来一杯 ✨',
  },
};

// 感受→写作落点：让不同标签写出不同味道，而不是逐条模板。
const FEELING_GUIDE = {
  '服务好': '侧重“服务态度与被照顾的感觉”，可写被耐心回应、及时周到（但别编造没发生的事）。',
  '出餐快': '侧重“出餐节奏与等待的轻松感”，可写没等多久、流程顺。',
  '环境干净': '侧重“空间整洁与舒适度”，可写干净、座位舒服、光线合适。',
  '饮品颜值高': '侧重“视觉与一杯饮品的样子”，可写颜色、分层、杯型好看。',
  '果肉超丰富': '侧重“用料实在与口感”，可写果肉足、每一口都有料。',
  '茶香浓郁': '侧重“香气与风味层次”，可写香气、回甘、层次感。',
};

export function buildMessages(input, store) {
  const platform = input.platform;
  const language = LANGUAGES.find(item => item.code === resolveLanguage(input.language, platform));
  const guide = PLATFORM_VOICE[platform];
  const feelings = input.tags.map(tag => `- ${tag}：${FEELING_GUIDE[tag] || '写真实、具体的一面。'}`).join('\n');
  const system = [
    `顾客在 ${store.city} 的 ${store.name} 消费，请你把 TA 的感受整理成一条可直接核对、准备发布到${platform === 'Google' ? ' Google 评价' : '小红书'}的初稿。`,
    `输出语言：${language.prompt}。除店名、地名外，全部使用指定语言，不附翻译、不混用其他语言。`,
    guide.persona,
    guide.structure,
    guide.rules,
    '只围绕下面列出的真实感受写作，不虚构饮品名称、价格、排队时间、具体服务细节、购买次数或回购经历；不要假装自己是顾客之外的人；只输出初稿本身，不要解释。',
    '严格约束：只能写本次明确选择的感受。凡是本次没有选择的感受、优点、缺点、描述（例如茶香、环境、价格、口味、颜值等）一律不要提及，即使下面示例或提示里出现也不要写入结果。',
    '写作要求：避免套路化开头和固定句式，让语气自然；把所选感受写活、写出重点，而不是逐条罗列。',
    `参考下面这条示范的“结构、语气与详略”（仅作示范：不要照抄原文，也不要被它的语言带偏；示范里提到的其它感受/描述，只要本次没选，就不要写进结果——输出语言一律以“输出语言”为准）：\n${guide.example}`,
  ];
  const user = `以下是在 ${store.city} 的 ${store.name} 消费后，顾客真实选择的感受。请把每一条都自然融进一条连贯的初稿（不要逐条硬凑）：\n${feelings}`;
  return [{ role: 'system', content: system.join('\n') }, { role: 'user', content: user }];
}
