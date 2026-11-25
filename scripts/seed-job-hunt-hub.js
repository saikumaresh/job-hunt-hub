// Seed sample data into localStorage for local previews and screenshots. Never shipped.
(() => {
  const D = 86400000;
  const now = Date.now();
  const set = (k, v) => localStorage.setItem(`job-hunt-hub:${k}`, JSON.stringify(v));
  set("settings", {
    kind: "settings",
    setupDone: true,
    tourDone: true,
    pageSize: "A4",
    targets: {
      titles: "Senior Data Engineer",
      locations: "Chennai, Remote",
      workMode: "Any",
      salaryFloor: "",
      notice: "60 days",
    },
    rules: { afterAppliedDays: 7, afterInterviewDays: 3 },
    notified: [],
  });
  set("profile", {
    kind: "profile",
    name: "Asha Rao",
    headline: "Senior Data Engineer",
    contact: {
      email: "asha.rao@example.com",
      phone: "+91 90000 00000",
      location: "Chennai, India",
      links: ["linkedin.com/in/asharao-sample"],
    },
    summary:
      "Data engineer with 6 years building batch and streaming pipelines on Spark, Airflow and Snowflake.",
    experience: [
      {
        id: "r1",
        company: "Northwind Analytics",
        title: "Senior Data Engineer",
        location: "Chennai",
        start: "Jan 2022",
        end: "Present",
        bullets: [
          {
            id: "r1b1",
            text: "Cut a nightly loader from 4h 40m to 1h 37m by rewriting joins and partitioning.",
          },
          {
            id: "r1b2",
            text: "Led 8 engineers moving 46 pipelines into a governed schema with zero data differences.",
          },
          {
            id: "r1b3",
            text: "Built drift checks that caught silent record loss across 300 Airflow pipelines.",
          },
          { id: "r1b4", text: "Designed an SCD2 star schema for a 100M-row-a-day fact table." },
        ],
      },
      {
        id: "r2",
        company: "Contoso Retail",
        title: "Data Engineer",
        location: "Bengaluru",
        start: "Jun 2019",
        end: "Dec 2021",
        bullets: [
          {
            id: "r2b1",
            text: "Moved reporting from cron scripts to Airflow, cutting failed runs by half.",
          },
          { id: "r2b2", text: "Wrote Spark jobs on EMR feeding 500 dashboards." },
        ],
      },
    ],
    projects: [],
    education: [
      {
        school: "Anna University",
        degree: "B.E. Computer Science",
        start: "2015",
        end: "2019",
        detail: "",
      },
    ],
    skills: [
      { name: "Data", items: ["Spark", "Airflow", "Kafka", "Snowflake", "Redshift"] },
      { name: "Languages", items: ["Python", "SQL", "Scala"] },
    ],
    certifications: ["AWS Certified Data Engineer, Associate"],
  });
  const job = (id, company, role, stage, daysAgo, extra = {}) => {
    const t = now - daysAgo * D;
    const order = ["Saved", "Applied", "Screening", "Interview", "Offer"];
    const stageDates = {};
    order
      .slice(0, Math.max(1, order.indexOf(stage) + 1))
      .forEach((s, i) => (stageDates[s] = t + i * 2 * D));
    if (stage === "Rejected")
      Object.assign(stageDates, { Saved: t, Applied: t + D, Rejected: t + 6 * D });
    set(`job-${id}`, {
      kind: "job",
      id,
      company,
      role,
      stage,
      location: "Chennai",
      salary: "",
      source: extra.source || "LinkedIn",
      link: "",
      contact: "",
      notes: "",
      postText: "",
      analysis: extra.score ? { score: extra.score, evidence: [{}], summary: "" } : null,
      stageDates,
      lastContactAt: null,
      interviewAt: null,
      followUpsDone: [],
      createdAt: t,
      updatedAt: t,
      nextAction: "",
    });
  };
  job("a", "Fabrikam", "Senior Data Engineer", "Applied", 10, { score: 82 });
  job("b", "Tailspin Toys", "Data Platform Engineer", "Interview", 9, {
    score: 74,
    source: "Referral",
  });
  job("c", "Wide World Importers", "Analytics Engineer", "Saved", 1);
  job("d", "Litware", "ML Data Engineer", "Screening", 6, { source: "Company site" });
  job("e", "Adatum", "Staff Data Engineer", "Applied", 3, { score: 68 });
  job("f", "Proseware", "Data Engineer II", "Rejected", 20);
  set("inbox", {
    kind: "inbox",
    seen: [],
    lastSync: now - 3600000,
    suggestions: [
      {
        threadId: "t1",
        subject: "Interview invitation: Senior Data Engineer",
        snippet: "",
        sender: "talent@fabrikam.com",
        date: now - 7200000,
        viewUrl: "",
        stage: "Interview",
        jobId: "a",
        done: false,
      },
    ],
  });
})();
