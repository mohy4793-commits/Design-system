# Design System + Short-Video Skill (material → vertical 9:16 video)

> **EN (short):** A config-driven, local-only kit that turns *any material* (web app, slides, lecture, app, data, images, a concept) into a polished vertical short video — brief → capture (headless-browser recorder with a visible mouse cursor) → tokenized, contrast-checked design system (4 presets, Arabic/RTL ready) → HyperFrames scenes rendered on CPU → beat-aligned licensed music → −14 LUFS → automated QA. Packaged as a Claude Code skill.

# نظام تصميم + مهارة لتحويل أي مادة إلى فيديو قصير عمودي (9:16)

مجموعة **محلية بالكامل** (بلا رندر سحابي) مُدارة بملفات إعداد، تشمل **نظام تصميم قابل للتخصيص** و**مهارة (Skill)** تُنفّذ خط الإنتاج كاملًا.

## ما في المستودع
```
skills/material-to-short-video/   ← المهارة (SKILL.md + السكربتات + القوالب + المراجع)
docs/design-system-universal.md   ← نظام التصميم العام (رموز، سمات، حركة، صوت، فحص)
docs/student-guide.md             ← دليل الطالب العام: عشر خطوات لفيديو قصير ممتاز
```

## نظام التصميم
- **أدوار ثابتة وقيم متغيرة:** كل شيء في `design-tokens.json`؛ تغيير قيمة يغيّر كل المشاهد.
- **أربع سمات جاهزة:** Dark Mint · Light Paper · Midnight Blue · Warm Dusk.
- **فحص رياضي للتباين (WCAG)** وحدود الأحجام: `node tools/check-tokens.mjs design-tokens.json`.
- **منطقة أمان** (أعلى 250 · أسفل 400 · جانب 120 على لوحة 1080×1920) وفحصها آليًا من الفيديو النهائي.

التفاصيل: [`docs/design-system-universal.md`](docs/design-system-universal.md).

## المهارة: ماذا تفعل
| المهمة | الحالة |
|---|---|
| تسجيل أدوات موقع/تطبيق ويب بمؤشر ماوس يسحب وينقر | ✅ مجرّب |
| إظهار كل أداة كاملة بلا قص | ✅ مجرّب |
| مشاهد عنوان / قبل-بعد (مسح) / لقطات / دعوة | ✅ مجرّب |
| عربية RTL | ✅ رندر كامل · إنجليزية LTR: ◐ توليد ولقطات فقط |
| ضبط حدود المشاهد على ضربات الموسيقى (`beats.mjs`) | ✅ |
| معايرة ‎−14 LUFS + مراجعة آلية (مدة، جهارة، هوامش) | ✅ |
| شرائح/PDF/تطبيقات جوال/كود/بيانات | 🔶 توصيات في `references/material-playbook.md` **لم تُجرَّب** |

**لا تدعم:** تعليقًا صوتيًا، أو مواد تحتاج تسجيل دخول، أو أنظمة غير ويندوز (مسارات Edge/Chrome مضبوطة على ويندوز).

## المتطلبات
- **Node.js** (جُرّب على 24) · **ffmpeg** و**ffprobe** · **Edge أو Chrome**
- **[HyperFrames](https://hyperframes.heygen.com)** للرندر المحلي: `npm install hyperframes gsap` **في مسار بلا حروف عربية** (مثل `C:\hf-env`). أول رندر ينزّل متصفحًا خاصًا (≈15 دقيقة مرة واحدة). استخدم `--no-browser-gpu` ليبقى الرندر على المعالج، و`hyperframes telemetry disable` لتعطيل بيانات الاستخدام.
- **gsap.min.js:** لا يُوزَّع مع هذا المستودع؛ يبحث عنه `init.mjs` في `node_modules` أو `GSAP_PATH` أو `HF_ENV`، وإلا يشرح لك طريقة نسخه.

## التثبيت كمهارة في Claude Code
```bash
git clone https://github.com/mohy4793-commits/Design-system.git
# انسخ المجلد إلى مجلد مهاراتك:
#   ويندوز:  %USERPROFILE%\.claude\skills\material-to-short-video
cp -r Design-system/skills/material-to-short-video ~/.claude/skills/
```
ثم اطلب بلغتك العادية: «حوّل هذه المادة إلى فيديو قصير 45 ثانية». تتوقف المهارة عند نقاط موافقة أربع (فهم المادة، السيناريو، الموسيقى، الاعتماد).

> `npx skills add mohy4793-commits/Design-system` قد يعمل مع هذه البنية (`skills/<name>/SKILL.md`) لكنه **لم يُجرَّب**.

## التشغيل اليدوي (جُرّب)
```bash
node skills/material-to-short-video/scripts/init.mjs C:\video\demo --preset dark-mint --lang ar
cd C:\video\demo
# ضع الخطوط في graphics/assets/fonts وعرّفها في fonts.json، وضع مسار hyperframes في project.json
node tools/check-tokens.mjs design-tokens.json
node tools/serve.mjs <مجلد-المادة> 5173          # في نافذة أخرى (للقراءة فقط)
node tools/record.mjs all --base http://localhost:5173
# عدّل scenes.json ثم:
node tools/prep-clips.mjs && node tools/gen-composition.mjs && node tools/make-fonts.mjs
node build.mjs && node tools/review.mjs
```
مادة تجريبية جاهزة: `skills/material-to-short-video/templates/demo-material/index.html`.

## ما لا يحويه المستودع (عمدًا)
- **الخطوط:** استخدم خطوط مادتك أو خطوطًا مرخّصة وسجّل رخصتها.
- **الموسيقى:** استخدم مقطوعات مرخّصة لك وتحقق من رخصتها قبل النشر.
- **gsap وHyperFrames:** يُثبَّتان من npm حسب ترخيصهما.

## الترخيص
**لم يُحدَّد بعد.** بدون ملف `LICENSE` تبقى الحقوق محفوظة لصاحب المستودع. أضف الترخيص الذي تريده (مثل MIT) قبل أن يعيد الآخرون استخدام الكود.
