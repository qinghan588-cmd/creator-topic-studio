import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTopics, normalizeProfile } from '../public/topic-engine.mjs';

test('空输入给出完整、唯一且可执行的九个选题', () => {
  const result = generateTopics();
  assert.equal(result.mode, 'template');
  assert.equal(result.topics.length, 9);
  assert.equal(new Set(result.topics.map((topic) => topic.id)).size, 9);
  assert.equal(new Set(result.topics.map((topic) => topic.title)).size, 9);
  assert.match(result.analysis, /本地灵感模板/);
  for (const topic of result.topics) {
    for (const field of ['title', 'angle', 'category', 'format', 'reason', 'hook', 'materialHint']) assert.ok(topic[field].length > 0, field);
    assert.ok(topic.outline.length >= 3);
    assert.equal(topic.titles.length, 3);
    assert.ok(topic.tags.length >= 2);
    assert.ok(['低', '中'].includes(topic.effort));
    assert.ok(['实用干货', '避坑指南', '观点讨论', '清单合集', '真实记录'].includes(topic.category));
  }
});

test('领域和读者会改变写作内容，不把所有方向都写成 AI 工具', () => {
  const beauty = generateTopics({ niche: '通勤美妆', audience: '每天早上赶时间的上班族' });
  const work = generateTopics({ niche: 'AI 办公工具' });
  assert.match(JSON.stringify(beauty.topics), /日常底妆|妆容/);
  assert.match(beauty.topics[0].reason, /每天早上赶时间的上班族/);
  assert.doesNotMatch(JSON.stringify(beauty.topics), /周报|会议纪要|AI 工作流/);
  assert.notEqual(beauty.topics[0].title, work.topics[0].title);
});

test('自定义领域和关键词进入标题，保留用户的具体写作方向', () => {
  const result = generateTopics({ niche: '独立书店经营', keywords: '社区活动，选书方法、空间陈列' });
  const titles = result.topics.map((topic) => topic.title).join('\n');
  assert.match(titles, /社区活动/);
  assert.match(titles, /选书方法/);
  assert.match(titles, /空间陈列/);
  assert.match(result.analysis, /独立书店经营/);
  assert.doesNotMatch(titles, /AI 工作流|周报/);
});

test('第一版固定为公众号文章，不受旧平台输入影响', () => {
  const article = generateTopics({ platform: '公众号' });
  assert.deepEqual(generateTopics({ platform: '小红书' }), article);
  assert.equal(normalizeProfile({ platform: '抖音' }).platform, '公众号');
  assert.match(article.analysis, /公众号/);
  assert.match(article.topics[0].format, /文章/);
  assert.doesNotMatch(JSON.stringify(article), /口播|短视频|小红书|抖音/);
  const readerQna = article.topics.find((topic) => topic.format === '读者问答');
  assert.ok(readerQna);
  assert.match(readerQna.outline.join(''), /第一问|第二问|第三问/);
});

test('目标和语气影响内容建议，而不是虚构流量分数', () => {
  const result = generateTopics({ goal: '互动', tone: '观点表达' });
  assert.match(result.topics[0].reason, /邀请读者/);
  assert.match(result.topics[0].hook, /判断依据/);
  assert.doesNotMatch(JSON.stringify(result), /爆款率|预计阅读|必火|热度分/);
});

test('同一输入可复现，换一批会产生新的选题与标识', () => {
  const profile = { niche: '一人食', keywords: '冷藏备菜，晚餐安排' };
  assert.deepEqual(generateTopics(profile, 1), generateTopics(profile, 1));
  assert.notDeepEqual(generateTopics(profile, 0).topics.map((topic) => topic.title), generateTopics(profile, 1).topics.map((topic) => topic.title));
  assert.notEqual(generateTopics(profile, 0).topics[0].id, generateTopics(profile, 1).topics[0].id);
});

test('用户素材被标注为线索，不擅自当作已验证事实或个人经历', () => {
  const result = generateTopics({ material: '我想比较会议纪要工具。暂时还没实际试用。' });
  assert.match(result.topics[0].materialHint, /我想比较会议纪要工具/);
  assert.match(result.topics[0].materialHint, /你提供的素材/);
  assert.match(result.topics[0].materialHint, /核对原始信息/);
  const record = result.topics.find((topic) => topic.category === '真实记录');
  assert.doesNotMatch(record.hook, /我试用了|亲测|我花了|增长了/);
  assert.match(record.outline.join(''), /完成任务后再写/);
});

test('异常输入不会执行 HTML，字段长度和枚举受到约束', () => {
  const profile = normalizeProfile({ niche: '<img src=x onerror=alert(1)>咖啡', platform: '未知平台', goal: 3, tone: null, material: '字'.repeat(7000) });
  assert.equal(profile.niche, '咖啡');
  assert.equal(profile.platform, '公众号');
  assert.equal(profile.goal, '涨粉');
  assert.equal(profile.tone, '真诚分享');
  assert.equal(profile.material.length, 6000);
  assert.doesNotThrow(() => generateTopics(null, '不是数字'));
  assert.doesNotThrow(() => generateTopics({ niche: {} }, -4));
});

test('台面等名词关键词成为自然主题，不拼接出错误的动宾结构', () => {
  const profile = { niche: '家居收纳', keywords: '厨房收纳，台面' };
  for (let seed = 0; seed < 3; seed += 1) {
    const result = generateTopics(profile, seed);
    const allText = JSON.stringify(result.topics);
    assert.match(allText, /台面整理/);
    assert.match(allText, /操作空间|操作动线|常用物品/);
    assert.doesNotMatch(allText, /收藏台面|做台面不顺|做一次台面|准备做台面/);
    assert.doesNotMatch(allText, /AI 工作流|会议摘要|周报/);
    assert.ok(result.topics.every((topic) => topic.titles.length === 3));
  }
});

test('AI 效率选题面向读者的工作任务，标题不退化成教创作者选题', () => {
  const result = generateTopics({ keywords: 'AI工作流，信息整理，效率工具' });
  const titles = result.topics.flatMap((topic) => topic.titles).join('\n');
  assert.match(titles, /会议记录|待办清单/);
  assert.match(titles, /资料库|文件夹|标签|收藏/);
  assert.match(titles, /迁移成本|重复任务|换工具/);
  assert.doesNotMatch(titles, /罗列工具|把第一步讲清楚|创作者|选题|账号|把过程留下/);
  const information = result.topics.find((topic) => topic.title.includes('信息整理'));
  assert.match(information.outline.join(''), /资料|收藏|任务/);
});
