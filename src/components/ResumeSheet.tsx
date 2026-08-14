import type { ParsedResume } from "@/lib/resume/types";

/**
 * The resume as a document — what `window.print()` puts on paper.
 *
 * Renders the structure and nothing else. There is no template voice here, no
 * summary we compose, no bullet we rewrite: every string on the page came from
 * the student's document or from their own edit. That boundary is what keeps
 * this line separate from the Smart Resume converter, which is still blocked
 * on structuring logic we have not been given — inventing one here is exactly
 * what that block exists to prevent.
 *
 * A section with no content is omitted rather than printed as an empty
 * heading, for the same reason a null renders as an honest slot everywhere
 * else: "PROJECTS" over blank space states that a student has none.
 */
export function ResumeSheet({ resume }: { resume: ParsedResume }) {
  // Contact details vary in how many exist; the ones present join on a
  // separator, so a missing phone never leaves a stray bullet.
  const contact = [resume.email, resume.phone, ...resume.links].filter(Boolean);

  const education = [
    resume.school,
    resume.major,
    resume.gradYear ? `Class of ${resume.gradYear}` : null,
    resume.gpa !== null ? `GPA ${resume.gpa}` : null,
  ].filter(Boolean);

  const hasExperience = resume.experiences.length > 0;
  const hasProjects = resume.projects.length > 0;
  const hasSkills = resume.skills.length > 0;

  return (
    <div className="resume-sheet">
      {/* Name and contact as the first plain-text lines of the document —
          the placement the critique engine tells students to use, because a
          name inside a banner image reads to a parser as anonymous. */}
      <div className="resume-name">{resume.name ?? "Your name"}</div>
      {contact.length > 0 && <div className="resume-contact">{contact.join("  ·  ")}</div>}

      {education.length > 0 && (
        <>
          <div className="resume-section-title">Education</div>
          <div className="resume-entry">{education.join("  ·  ")}</div>
        </>
      )}

      {hasExperience && (
        <>
          <div className="resume-section-title">Experience</div>
          {resume.experiences.map((exp, i) => {
            const heading = [exp.role, exp.organization].filter(Boolean).join(" — ");
            const meta = [exp.location, exp.dates].filter(Boolean).join("  ·  ");
            return (
              <div className="resume-entry" key={i}>
                <div className="resume-entry-head">
                  <span>{heading || "—"}</span>
                  {meta && <span className="resume-entry-meta">{meta}</span>}
                </div>
                {exp.bullets.length > 0 && (
                  <ul>
                    {exp.bullets.map((bullet, j) => (
                      <li key={j}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </>
      )}

      {hasProjects && (
        <>
          <div className="resume-section-title">Projects</div>
          {resume.projects.map((project, i) => (
            <div className="resume-entry" key={i}>
              <div className="resume-entry-head">
                <span>{project.name ?? "—"}</span>
                {project.link && <span className="resume-entry-meta">{project.link}</span>}
              </div>
              {project.description && <div>{project.description}</div>}
            </div>
          ))}
        </>
      )}

      {hasSkills && (
        <>
          <div className="resume-section-title">Skills</div>
          <div className="resume-entry">{resume.skills.join("  ·  ")}</div>
        </>
      )}
    </div>
  );
}
