insert into public.lessons (slug, title, summary, content, xp_reward, published)
values
  (
    'budget-basics',
    'Budget basics for student life',
    'Learn how a simple monthly plan can make irregular student income easier to manage.',
    '{"sections":[{"heading":"Start with what arrives","body":"List fictional income in cents, then give every dollar a purpose."}]}'::jsonb,
    50,
    true
  ),
  (
    'credit-utilization',
    'Credit utilization without the mystery',
    'Practise comparing a fictional card balance with its limit without predicting a credit score.',
    '{"sections":[{"heading":"It is a ratio","body":"Utilization compares a card balance with its credit limit. It is educational, not a score guarantee."}]}'::jsonb,
    50,
    true
  )
on conflict (slug) do update
set title = excluded.title,
    summary = excluded.summary,
    content = excluded.content,
    xp_reward = excluded.xp_reward,
    published = excluded.published;
