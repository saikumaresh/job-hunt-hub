// Prompts sent to Claude. Each one carries every rule and all the data it needs,
// because each call is memoryless. Outputs are always checked by facts.js before use.

const J = (v) => JSON.stringify(v);

export function structureProfilePrompt(resumeText) {
  return `Turn this resume text into structured JSON. Copy facts exactly. Do not add, infer or improve anything.
Keep every bullet's numbers, names and dates exactly as written. If a field is missing, leave it empty.

Return JSON only, in this shape:
{"name":"","headline":"","contact":{"email":"","phone":"","location":"","links":[""]},"summary":"",
 "experience":[{"company":"","title":"","location":"","start":"","end":"","bullets":[""]}],
 "projects":[{"name":"","link":"","bullets":[""]}],
 "education":[{"school":"","degree":"","start":"","end":"","detail":""}],
 "skills":[{"name":"Languages","items":[""]}],
 "certifications":[""]}

Resume text:
"""
${resumeText.slice(0, 24000)}
"""`;
}

export function analysePrompt(postText, profile, targets) {
  return `You are helping a job seeker judge one job posting against their own profile.
Read the posting and the profile. Be honest: a weak match should score low.

Rules:
- Every "quote" must be copied word for word from the posting.
- "profileFact" must come from the profile. If the profile has nothing, set match to "gap" and profileFact to "".
- Do not invent salary, location or company details. Leave a field empty if the posting does not say.

Return JSON only:
{"company":"","role":"","location":"","salary":"","seniority":"","summary":"one or two sentences",
 "mustHave":[""],"niceToHave":[""],"redFlags":[""],
 "evidence":[{"requirement":"","quote":"","match":"strong|partial|gap","profileFact":""}],
 "talkingPoints":["three short points the person can raise in an interview, from their profile"],
 "score":0}

What they are looking for: ${J(targets || {})}

Profile:
${J(slimProfile(profile))}

Posting:
"""
${postText.slice(0, 16000)}
"""`;
}

export function tailorPrompt(profile, job) {
  return `Tailor a one-page resume for this role, using ONLY the person's own bullets.

You may:
- choose which bullet ids to keep for each role, and their order (most relevant first);
- lightly rephrase a kept bullet to mirror the posting's words, when it stays true;
- reorder skills (only skills already in the profile);
- write a 2 to 3 sentence summary from profile facts.

You must not:
- add any number, date, employer, title, tool, skill or result that is not in the profile;
- merge two bullets into one claim, or make a claim stronger than the original.

Keep about 3 to 5 bullets for the most recent roles and 1 to 2 for older ones.

Return JSON only:
{"summary":"","experience":[{"id":"r1","bulletIds":["r1b1"],"rewrites":{"r1b1":"rephrased text"}}],
 "skills":["skill names in priority order"],"keywords":["posting keywords you matched"]}

Profile (with ids):
${J(slimProfile(profile, true))}

Role: ${job.role} at ${job.company}
Posting:
"""
${String(job.postText || "").slice(0, 12000)}
"""`;
}

export function coverNotePrompt(profile, job, tailored) {
  return `Write a short cover note for this application: 120 to 180 words, plain text, no greeting line, no sign-off.
Voice: direct, warm, specific. Short sentences. No buzzwords. No em dashes.
Use only facts from the profile. Never invent numbers, employers, tools or results.
Mention one or two things from the posting and connect each to a real fact from the profile.

Role: ${job.role} at ${job.company}
Posting summary: ${job.analysis?.summary || ""}
Key requirements: ${J(job.analysis?.mustHave || [])}
Tailored summary: ${tailored?.summary || profile.summary || ""}
Profile:
${J(slimProfile(profile))}`;
}

export function followUpPrompt(job, kind, profile) {
  const when = kind === "Interview" ? "after an interview" : "a week after applying with no reply";
  return `Draft a short, polite follow-up email ${when}. 60 to 110 words. Plain text.
Include a subject line on the first line as "Subject: ...". No em dashes. Do not invent details.
Role: ${job.role} at ${job.company}. Contact name if known: ${job.contact || "unknown (use a neutral greeting)"}.
Sender name: ${profile?.name || ""}.
Notes the person wrote: ${String(job.notes || "").slice(0, 600)}`;
}

/** Profile without long free text, to keep prompts small. */
function slimProfile(p, withIds = false) {
  if (!p) return {};
  return {
    name: p.name,
    headline: p.headline,
    summary: p.summary,
    experience: (p.experience || []).map((r) => ({
      ...(withIds ? { id: r.id } : {}),
      company: r.company,
      title: r.title,
      start: r.start,
      end: r.end,
      bullets: (r.bullets || []).map((b) => (withIds ? { id: b.id, text: b.text } : b.text)),
    })),
    projects: (p.projects || []).map((x) => ({
      name: x.name,
      bullets: (x.bullets || []).map((b) => b.text),
    })),
    skills: (p.skills || []).flatMap((g) => g.items),
    education: p.education,
    certifications: p.certifications,
  };
}
