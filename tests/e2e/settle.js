// 页面有分层淡入动画，直接截图会留下半透明中间帧；截图前等有限动画跑完。
// 无限动画（生成中的加载圈）不阻塞等待。
export async function settleAnimations(page) {
  await page.waitForFunction(() => document.getAnimations().every(animation => {
    const timing = animation.effect?.getTiming();
    return timing?.iterations === Infinity || animation.playState !== 'running';
  }));
}
