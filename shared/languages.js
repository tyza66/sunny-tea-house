// 页面语言和评价语言使用同一份白名单；平台标识、感受标签在接口中保持不变。
export const LANGUAGES = [
  { code: 'zh-CN', label: '简体中文', prompt: '简体中文' },
  { code: 'zh-TW', label: '繁體中文', prompt: '繁體中文' },
  { code: 'en', label: 'English', prompt: '自然的北美英语' },
  { code: 'fr-CA', label: 'Français (Canada)', prompt: '加拿大法语，使用自然的加拿大法语用词' },
  { code: 'es', label: 'Español', prompt: '自然的北美西班牙语' },
];
export const isLanguage = code => LANGUAGES.some(language => language.code === code);
export const resolveLanguage = (language, platform) => !language || language === 'auto' ? (platform === 'Google' ? 'en' : 'zh-CN') : language;

// 将服务端中文错误映射为稳定文案键，页面切换语言时已有错误也会立即更新。
export const ERROR_KEYS = {
  '请选择 1–2 个有效感受标签和发布平台。': 'invalidInput',
  '请选择支持的评价语言。': 'invalidInput',
  '生成超时，请稍后重试。': 'timeout',
  '暂时无法连接生成服务，请稍后重试。': 'networkError',
  '生成服务的密钥无效，请联系店家检查配置。': 'keyError',
  '生成服务余额不足，请联系店家处理。': 'balanceError',
  '生成服务繁忙，请稍后重试。': 'rateError',
  '操作较频繁，请一分钟后再试。': 'rateError',
  '文案超出字数限制，请重新生成。': 'lengthError',
  '文案生成未完整结束，请重新生成。': 'incompleteError',
  '未收到有效评价，请重新生成。': 'incompleteError',
};
