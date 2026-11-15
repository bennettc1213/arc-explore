import type { BulletFlag, SmartResume } from "@/lib/resume/smart";

const FLAG_LABEL: Record<BulletFlag, string> = {
  weak_opener: "weak opener",
  no_metric: "no number",
  too_long: "long",
};

/**
 * A converted resume as a document. Shares `ResumeSheet`'s classes, so it
 * prints in the same one-column, plain-heading layout.
 *
 * The flag tags beside each bullet are `print-hide`: they are advice for the
 * student, not part of what an employer reads.
 */
export function SmartResumeSheet({ resume }: { resume: SmartResume }) {
  return (
    <div className="resume-sheet">
      <div className="resume-name">{resume.name ?? "Your name"}</div>
      {resume.contact.length > 0 && <div className="resume-contact">{resume.contact.join("  ·  ")}</div>}

      {resume.education.length > 0 && (
        <>
          <div className="resume-section-title">Education</div>
          <div className="resume-entry">{resume.education.join("  ·  ")}</div>
        </>
      )}

      {resume.experiences.length > 0 && (
        <>
          <div className="resume-section-title">Experience</div>
          {resume.experiences.map((exp, i) => {
            const meta = [exp.location, exp.dates].filter(Boolean).join("  ·  ");
            return (
              <div className="resume-entry" key={i}>
                <div className="resume-entry-head">
                  <span>{exp.heading}</span>
                  {meta && <span className="resume-entry-meta">{meta}</span>}
                </div>
                {exp.bullets.length > 0 && (
                  <ul>
                    {exp.bullets.map((b, j) => (
                      <li key={j}>
                        {b.text}
                        {b.flags.length > 0 && (
                          <span className="smart-flags print-hide">
                            {b.flags.map((f) => (
                              <span key={f} className="smart-flag">
                                {FLAG_LABEL[f]}
                              </span>
                            ))}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </>
      )}

      {resume.projects.length > 0 && (
        <>
          <div className="resume-section-title">Projects</div>
          {resume.projects.map((p, i) => (
            <div className="resume-entry" key={i}>
              <div className="resume-entry-head">
                <span>{p.name}</span>
                {p.link && <span className="resume-entry-meta">{p.link}</span>}
              </div>
              {p.description && <div>{p.description}</div>}
            </div>
          ))}
        </>
      )}

      {resume.skills.length > 0 && (
        <>
          <div className="resume-section-title">Skills</div>
          <div className="resume-entry">{resume.skills.join("  ·  ")}</div>
        </>
      )}
    </div>
  );
}
