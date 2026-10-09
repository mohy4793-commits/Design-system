// سيناريوهات التسجيل (لمواد ويب). عدّل المحدّدات والتفاعلات لمادتك. كل سيناريو يُنتج raw/<اسم>.mp4
// الحقول: w (عرض الشاشة المنطقي) · dpr (كثافة البكسل) · h (ارتفاع ثابت، أو يُحسب من t.focus) · hideChrome:false لإبقاء الأشرطة الثابتة
//          init: سكربت يُنفَّذ قبل كل صفحة (مثل ضبط سمة الموقع) · setup(t) قبل التسجيل · run(t) أثناءه
// أدوات t: goto, sleep, focus(من, إلى, هامش علوي, هامش سفلي), cursorOn(), slide(أداة|محدد, مفتاح|'', قيمة, مللي),
//          click(محدد, فهرس), setValue(أداة, محدد حقل, قيمة), scrollTo(y, مللي), scrollToEl(محدد, مللي, إزاحة), eval(كود)
// محدّد برقم: 'محدد@2' يعني العنصر الثالث المطابق.
export const scenarios = {
  // نظرة عامة: تمرير بسيط، بدون مؤشر
  overview: {
    note: 'نظرة عامة على المادة', w: 390, dpr: 2.4, h: 640, hideChrome: false,
    async setup(t) { await t.goto('index.html'); await t.sleep(800); },
    async run(t) { await t.sleep(600); await t.scrollTo(220, 1000); await t.sleep(600); await t.scrollTo(0, 800); await t.sleep(300); },
  },

  // أداة تفاعلية كاملة: الشاشة بحجم الأداة + مؤشر ماوس يسحب وينقر
  demo: {
    note: 'سحب المنزلق ثم نقر الزر', w: 390, dpr: 2.4,
    async setup(t) {
      await t.goto('index.html'); await t.sleep(800);
      await t.focus('#card', null, 10, 30);   // يضبط الشاشة على ارتفاع الأداة (+هامش سفلي لأنها قد تكبر)
      await t.cursorOn();                      // مؤشر يدخل من خارج الشاشة
    },
    async run(t) {
      await t.sleep(350);
      await t.slide('#size', '', 110, 900); await t.sleep(200);   // '' = المنزلق نفسه
      await t.click('#toggle'); await t.sleep(600);
      await t.slide('#size', '', 35, 800); await t.sleep(400);
    },
  },
};
