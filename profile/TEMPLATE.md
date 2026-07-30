# Operator profile — template

Copy this to `profile/me.md` and fill it in. **`profile/me.md` is gitignored** — this
repository is public, and your profile is about you, not about the harness.

This is layer **L0**: it travels with the person, not the repository, and is loaded in
every project so the agent behaves the same everywhere.

It is not personality decoration. Every field below exists because it changes what an agent
should actually *do*. Fill in what is true; delete what isn't.

---

## role

Seniority and discipline, and how much explanation you want alongside a change.

> *Without it:* you get a diff with no reasoning, or a lecture on fundamentals you wrote.

## contexts

One entry per repository family you move between — its stack, and its stakes. Stakes
matter as much as stack: an environment with real users and real money earns more caution
than a scratch project.

> *Without it:* conventions leak between stacks, and risk gets judged uniformly across
> environments with very different consequences.

```
- <context name> — <stack>. <what's at stake>
```

## language

Default reply language, any per-context override, and the rule that **your own messages
decide** — never the surrounding context, memory files, or system text.

> *Without it:* the agent takes its language from whatever file it read last.

## permission

Which classes of action require asking in the current conversation rather than relying on
precedent. Typically: anything outward-facing, destructive, or irreversible.

Be explicit about what standing authorisation you *have* granted, and its exact scope.

> *Without it:* approval given once gets treated as permanent, which is how production
> gets touched.

## evidence

What you accept as proof. Commonly: verify against the source before asserting, and treat
stored notes as dated claims rather than current fact.

> *Without it:* the agent agrees confidently, cites something stale, and you both act on
> what is no longer true.

## authorship

Commit conventions, and whether generated work may be attributed in history or in pull
request bodies.

> *Without it:* trailers and co-author lines appear in a history meant to stay clean.

## interaction

How you want to be engaged: whether to push back, whether to offer alternatives with
trade-offs, and whether a question should end the turn rather than be answered by the
asker.

> *Without it:* the agent asks and then answers itself, or agrees with a wrong premise to
> stay agreeable.

## tooling

Preferred commands, and anything explicitly banned from your shell.

> *Without it:* muscle-memory defaults get used where you deliberately chose otherwise.
