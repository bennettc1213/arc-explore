"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { InterestSelect } from "@/components/InterestSelect";
import { OnboardingPlans } from "./Plans";
import { sendMagicLink } from "@/app/login/actions";
import { uploadResumeAction } from "@/app/profile/actions";
import {
  GOALS,
  ONBOARDING_KEY,
  onboardingSchema,
  isSchoolEmail,
} from "@/lib/onboarding";
import {
  EMPTY_PROFILE_INPUT,
  WORK_AUTH_OPTIONS,
  type UserProfile,
} from "@/lib/profile/types";
import { checkUpload, RESUME_EXTENSIONS } from "@/lib/resume/types";
import {
  checkStudentEmail,
  confirmStudentEmail,
  finishOnboarding,
  startStudentSSO,
} from "./actions";

const STEPS = [
  "Your goals",
  "Your account",
  "Your resume",
  "Your education",
  "The details",
  "Your filters",
  "Student perks",
];
type Answers = {
  displayName: string;
  school: string;
  major: string;
  gradYear: string;
  gpa: string;
  workAuth: string;
  locations: string;
  openToRemote: boolean;
  githubUsername: string;
  linkedinUrl: string;
  portfolioUrl: string;
  degree: string;
  education: string;
  interests: string[];
};
const TITLES = [
  [
    "What are you seeking",
    "to use Instela for?",
    "Choose what you’d like help with.",
  ],
  [
    "A place for",
    "your next chapter.",
    "Save your profile with a free account.",
  ],
  [
    "You’ve already done",
    "some of the work.",
    "Upload your resume to fill in your details.",
  ],
  ["Where are you", "in your journey?", "Choose where you are today."],
  [
    "A little more",
    "about your studies.",
    "Add what you know. Everything here is optional.",
  ],
  [
    "Make your feed",
    "feel like you.",
    "Choose your interests and preferences.",
  ],
  [
    "A plan for your",
    "next chapter.",
    "Keep it free, or get 50% off Pro as a verified student.",
  ],
];

export function Onboarding({
  email,
  profile,
  preferences,
  studentClaimStatus,
  verificationMessage,
}: {
  email: string | null;
  profile: UserProfile | null;
  preferences: unknown;
  studentClaimStatus: string | null;
  verificationMessage: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [goals, setGoals] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Answers>({
    displayName: profile?.displayName ?? "",
    school: profile?.school ?? "",
    major: profile?.major ?? "",
    gradYear: String(profile?.gradYear ?? ""),
    gpa: String(profile?.gpa ?? ""),
    workAuth: profile?.workAuth ?? "",
    locations: profile?.targetLocations.join(", ") ?? "",
    openToRemote: profile?.openToRemote ?? true,
    githubUsername: profile?.githubUsername ?? "",
    linkedinUrl: profile?.linkedinUrl ?? "",
    portfolioUrl: profile?.portfolioUrl ?? "",
    degree: "",
    education: "",
    interests: profile?.targetVerticals ?? [],
  });
  const [accountEmail, setAccountEmail] = useState(email ?? "");
  const [schoolEmail, setSchoolEmail] = useState(
    email && isSchoolEmail(email) ? email : "",
  );
  const [studentCode, setStudentCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [useEmailCode, setUseEmailCode] = useState(false);
  const [schoolVerified, setSchoolVerified] = useState(
    Boolean(studentClaimStatus),
  );
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(verificationMessage);
  const [resumeName, setResumeName] = useState("");
  const [dragging, setDragging] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ONBOARDING_KEY) ?? "null");
      if (
        saved &&
        (!saved.owner || saved.owner === email) &&
        Date.now() - saved.savedAt < 7 * 86400000
      ) {
        if (saved.answers && typeof saved.answers === "object") {
          setAnswers((a) => ({
            ...a,
            ...Object.fromEntries(
              Object.entries(saved.answers).filter(([k, v]) =>
                k === "interests"
                  ? Array.isArray(v) && v.every((x) => typeof x === "string")
                  : k === "openToRemote"
                    ? typeof v === "boolean"
                    : k in a && typeof v === "string",
              ),
            ),
          }));
        }
        if (Array.isArray(saved.goals))
          setGoals(
            saved.goals.filter((id: string) => GOALS.some((g) => g.id === id)),
          );
        if (Number.isInteger(saved.step))
          setStep(Math.min(6, Math.max(0, saved.step)));
      } else if (preferences && typeof preferences === "object") {
        const p = preferences as {
          goals?: string[];
          degree?: string;
          education?: string;
        };
        if (Array.isArray(p.goals))
          setGoals(p.goals.filter((id) => GOALS.some((g) => g.id === id)));
        setAnswers((a) => ({
          ...a,
          degree: typeof p.degree === "string" ? p.degree : "",
          education: typeof p.education === "string" ? p.education : "",
        }));
      }
    } catch {
      /* Storage can be unavailable; setup still works in memory. */
    }
    setReady(true);
  }, [email, preferences]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        ONBOARDING_KEY,
        JSON.stringify({
          answers,
          goals,
          step,
          owner: email,
          savedAt: Date.now(),
        }),
      );
    } catch {
      /* Do not block the form when browser storage is unavailable. */
    }
  }, [answers, goals, step, email, ready]);

  function move(next: number) {
    setStep(next);
    setError("");
    setNotice("");
    requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
  function field(key: keyof Answers, value: string | boolean | string[]) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }
  function toggleGoal(id: string) {
    setGoals((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  }
  function payload() {
    return {
      goals,
      degree: answers.degree,
      education: answers.education,
      profile: {
        ...EMPTY_PROFILE_INPUT,
        ...answers,
        targetVerticals: answers.interests,
        targetLocations: answers.locations
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      },
    };
  }
  function guestFeed() {
    const q = new URLSearchParams();
    if (goals.includes("scholarships") && !goals.includes("internships"))
      q.set("kind", "scholarship");
    if (goals.includes("internships") && !goals.includes("scholarships"))
      q.set("kind", "internship");
    for (const key of ["major", "gradYear", "workAuth"] as const)
      if (answers[key]) q.set(key, answers[key]);
    if (answers.locations) q.set("locations", answers.locations);
    for (const interest of answers.interests)
      q.append("targetVerticals", interest);
    if (!answers.openToRemote) q.set("remote", "0");
    return `/explore?${q}`;
  }
  async function sendLink() {
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.set("email", accountEmail);
      data.set("next", "/onboarding");
      const result = await sendMagicLink({ status: "idle" }, data);
      if (result.status === "error")
        setError(result.message ?? "Couldn’t send your link. Try again.");
      else setSent(true);
    } catch {
      setError("Couldn’t send your link. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file || busy) return;
    setError("");
    setNotice("");
    const check = checkUpload(file);
    if (!check.ok) {
      setError(check.error ?? "Please choose a PDF or text resume.");
      return;
    }
    if (!email) {
      setError(
        "Verify your account email first to securely upload a resume. You can also enter your details manually.",
      );
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.set("resume", file);
      const result = await uploadResumeAction({ status: "idle" }, data);
      if (result.status === "error") {
        setError(result.message ?? "Couldn’t read your resume.");
        return;
      }
      if (result.suggestions)
        setAnswers((a) => {
          const next = { ...a };
          for (const [key, value] of Object.entries(result.suggestions!)) {
            if (key in next && !next[key as keyof Answers])
              Object.assign(next, { [key]: String(value) });
          }
          return next;
        });
      setResumeName(file.name);
      setNotice("Resume imported. Review your details in the next steps.");
    } catch {
      setError(
        "We couldn’t process that resume. Try again, or continue with your details below.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function finish(discount: boolean) {
    setBusy(true);
    setError("");
    try {
      const parsed = onboardingSchema.safeParse(payload());
      if (!parsed.success) {
        setError(
          `Please review your answers: ${parsed.error.issues[0]?.message}`,
        );
        return;
      }
      if (discount) {
        if (!email) {
          router.push("/login?next=%2Fonboarding");
          return;
        }
        if (!useEmailCode && studentClaimStatus !== "verified") {
          const result = await startStudentSSO(schoolEmail);
          if (!result.ok || !result.url) {
            setError(result.message ?? "Couldn’t start university sign-in.");
            return;
          }
          window.location.assign(result.url);
          return;
        }
        if (!schoolVerified) {
          const result = codeSent
            ? await confirmStudentEmail(studentCode)
            : await checkStudentEmail(schoolEmail);
          if (!result.ok) {
            setError(result.message);
            return;
          }
          setNotice(result.message);
          if (!codeSent) {
            setCodeSent(true);
            return;
          }
          setSchoolVerified(true);
        }
      }
      if (email) {
        const result = await finishOnboarding(payload());
        if (!result.ok) {
          setError(
            result.message ?? "Please sign in again to save your profile.",
          );
          return;
        }
        try {
          localStorage.removeItem(ONBOARDING_KEY);
        } catch {
          /* optional */
        }
      }
      router.push(
        discount
          ? "/pricing?student=1"
          : email
            ? guestFeed()
            : "/login?next=%2Fonboarding",
      );
    } catch {
      setError(
        "Something went wrong. Your answers are still here. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step === 0 && goals.length === 0) {
      setError("Pick at least one thing you’d like help with.");
      return;
    }
    if (step === 6) {
      void finish(true);
      return;
    }
    move(step + 1);
  }
  const input = (
    key: keyof Answers,
    label: string,
    placeholder: string,
    type = "text",
  ) => (
    <label className="ob-field">
      <span>{label}</span>
      <input
        className="field"
        type={type}
        value={String(answers[key])}
        onChange={(e) => field(key, e.target.value)}
        placeholder={placeholder}
        maxLength={key === "displayName" ? 120 : 160}
        autoComplete={key === "displayName" ? "name" : undefined}
        min={key === "gpa" ? 0 : key === "gradYear" ? 2016 : undefined}
        max={key === "gpa" ? 4.5 : key === "gradYear" ? 2036 : undefined}
        step={key === "gpa" ? "0.01" : undefined}
      />
    </label>
  );

  return (
    <main className="ob-shell wrap">
      <div className="ob-progress-head">
        <Link href="/" className="mono ob-home">
          ← Back to Instela
        </Link>
        <span className="mono">
          YOUR NEXT CHAPTER / {String(step + 1).padStart(2, "0")} OF 07
        </span>
      </div>
      <div
        className="ob-progress"
        role="progressbar"
        aria-label="Profile setup progress"
        aria-valuemin={0}
        aria-valuemax={7}
        aria-valuenow={step + 1}
        aria-valuetext={`Step ${step + 1} of 7: ${STEPS[step]}`}
      >
        <div style={{ width: `${((step + 1) / 7) * 100}%` }} />
      </div>
      <div className="ob-grid">
        <aside className="ob-aside">
          <div className="eyebrow chrome">A LITTLE ABOUT YOU</div>
          <h2>
            Less searching.
            <br />
            More <span>possibility.</span>
          </h2>
          <ol className="ob-step-list">
            {STEPS.map((label, i) => (
              <li
                key={label}
                className={i === step ? "is-active" : i < step ? "is-done" : ""}
                aria-current={i === step ? "step" : undefined}
              >
                <span>{i < step ? "✓" : String(i + 1).padStart(2, "0")}</span>
                {label}
                {i === step && <span className="ob-current-dot" />}
              </li>
            ))}
          </ol>
        </aside>
        <section className="ob-content" aria-label={STEPS[step]}>
          <div className="ob-section-top">
            <span className="mono">
              {String(step + 1).padStart(2, "0")} / {STEPS[step].toUpperCase()}
            </span>
          </div>
          <form onSubmit={submit}>
            <div key={step} className="ob-stage">
              <h1 ref={titleRef} tabIndex={-1}>
                {TITLES[step][0]}
                <br />
                <span>{TITLES[step][1]}</span>
              </h1>
              <p className="ob-description">{TITLES[step][2]}</p>
              {step === 0 && (
                <>
                  <div className="ob-pick-label mono">
                    CHOOSE ANY <span>{goals.length} SELECTED</span>
                  </div>
                  <div className="ob-goals">
                    {GOALS.map((goal) => (
                      <button
                        key={goal.id}
                        type="button"
                        className={`ob-goal ${goals.includes(goal.id) ? "selected" : ""}`}
                        aria-pressed={goals.includes(goal.id)}
                        onClick={() => toggleGoal(goal.id)}
                      >
                        <span className="ob-goal-icon" aria-hidden>
                          {goal.icon}
                        </span>
                        <span className="ob-goal-copy">
                          <strong>{goal.title}</strong>
                          {"soon" in goal && <small>COMING SOON</small>}
                        </span>
                        <span className="ob-checkbox" aria-hidden>
                          {goals.includes(goal.id) ? "✓" : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {step === 1 && (
                <div className="ob-fields">
                  {input(
                    "displayName",
                    "What should we call you?",
                    "Your full name",
                  )}
                  {email ? (
                    <div className="ob-notice">
                      ✓ Signed in as {email}. Your profile will be saved to this
                      account.
                    </div>
                  ) : (
                    <>
                      <label className="ob-field">
                        <span>Your email address</span>
                        <input
                          className="field"
                          type="email"
                          value={accountEmail}
                          onChange={(e) => {
                            setAccountEmail(e.target.value);
                            setSent(false);
                          }}
                          placeholder="you@school.edu"
                          autoComplete="email"
                          maxLength={254}
                        />
                      </label>
                      <button
                        type="button"
                        className="ob-outline"
                        disabled={busy || !accountEmail}
                        onClick={sendLink}
                      >
                        {busy
                          ? "Sending…"
                          : sent
                            ? "Resend sign-in link ↗"
                            : "Create account with email ↗"}
                      </button>
                      {sent && (
                        <div className="ob-notice" role="status">
                          Check your inbox at {accountEmail}. Open the link to
                          verify your account. You can keep filling this out
                          while you wait.
                          <button
                            type="button"
                            onClick={() => router.refresh()}
                          >
                            I’ve verified my email ↗
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  <p className="ob-help">
                    By creating an account, you acknowledge our{" "}
                    <Link href="/privacy">privacy policy</Link>.
                  </p>
                </div>
              )}
              {step === 2 && (
                <>
                  <div
                    className={`ob-drop ${dragging ? "dragging" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      void upload(e.dataTransfer.files[0]);
                    }}
                  >
                    <span className="ob-upload-icon" aria-hidden>
                      ↑
                    </span>
                    <h3>
                      {busy
                        ? "Reading your resume…"
                        : resumeName || "Drop your resume right here"}
                    </h3>
                    <p>or choose a file to get a head start</p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={RESUME_EXTENSIONS}
                      className="ob-file-input"
                      aria-label="Upload your resume"
                      disabled={busy}
                      onChange={(e) => {
                        void upload(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="ob-outline"
                      disabled={busy}
                      onClick={() => fileRef.current?.click()}
                    >
                      {resumeName ? "Choose another file" : "Browse files ↗"}
                    </button>
                    <span className="mono">
                      PDF, WORD, HTML, TEXT & IMAGES · UP TO 5 MB
                    </span>
                  </div>
                  {!email && (
                    <p className="ob-help">
                      Resume upload requires a verified account.{" "}
                      <Link href="/login?next=%2Fonboarding">
                        Sign in to upload
                      </Link>
                      , or continue to enter your details manually.
                    </p>
                  )}
                </>
              )}
              {step === 3 && (
                <>
                  <div className="ob-education">
                    {[
                      [
                        "high-school",
                        "Still in high school",
                        "Exploring what comes next",
                      ],
                      [
                        "college",
                        "In college",
                        "Building my undergraduate path",
                      ],
                      [
                        "transfer",
                        "Planning to transfer",
                        "A new school, a new chapter",
                      ],
                      [
                        "graduate",
                        "Graduate student",
                        "Going deeper into my field",
                      ],
                      [
                        "other",
                        "Taking my own path",
                        "Gap year, recent grad, or something else",
                      ],
                    ].map(([id, label]) => (
                      <button
                        type="button"
                        key={id}
                        className={`ob-education-choice ${answers.education === id ? "selected" : ""}`}
                        aria-pressed={answers.education === id}
                        onClick={() => field("education", id)}
                      >
                        <span>
                          <strong>{label}</strong>
                        </span>
                        <span className="ob-checkbox" aria-hidden>
                          {answers.education === id ? "✓" : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="ob-fields">
                    {input(
                      "school",
                      answers.education === "high-school"
                        ? "High school"
                        : "College or university",
                      "Start typing your school name",
                    )}
                    <label className="ob-field">
                      <span>Degree you’re pursuing or planning</span>
                      <select
                        className="field"
                        value={answers.degree}
                        onChange={(e) => field("degree", e.target.value)}
                      >
                        <option value="">Choose a degree (optional)</option>
                        <option>High school diploma</option>
                        <option>Certificate</option>
                        <option>Associate degree</option>
                        <option>Bachelor’s degree</option>
                        <option>Master’s degree</option>
                        <option>Doctorate</option>
                        <option>Professional degree</option>
                        <option>Undecided</option>
                      </select>
                    </label>
                  </div>
                </>
              )}
              {step === 4 && (
                <div className="ob-fields">
                  {input(
                    "major",
                    "Major or intended field of study",
                    "e.g. Computer Science",
                  )}
                  <div className="ob-field-pair">
                    {input(
                      "gradYear",
                      "Expected graduation year",
                      "e.g. 2028",
                      "number",
                    )}
                    {input(
                      "gpa",
                      "GPA (on a 4.0 scale, up to 4.5 weighted)",
                      "e.g. 3.75",
                      "number",
                    )}
                  </div>
                </div>
              )}
              {step === 5 && (
                <div className="ob-fields">
                  <div className="ob-field">
                    <span>Fields you’re interested in</span>
                    <InterestSelect
                      value={answers.interests}
                      onChange={(next) => field("interests", next)}
                    />
                  </div>

                  {input(
                    "locations",
                    "Where would you like to work or study?",
                    "e.g. California, New York",
                  )}
                  <label className="ob-check-row">
                    <input
                      type="checkbox"
                      checked={answers.openToRemote}
                      onChange={(e) => field("openToRemote", e.target.checked)}
                    />
                    I’m open to remote opportunities
                  </label>
                  <label className="ob-field">
                    <span>U.S. work authorization</span>
                    <select
                      className="field"
                      value={answers.workAuth}
                      onChange={(e) => field("workAuth", e.target.value)}
                    >
                      <option value="">Prefer to answer later</option>
                      {WORK_AUTH_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {goals.includes("github") &&
                    input("githubUsername", "GitHub username", "e.g. octocat")}
                  {goals.includes("linkedin") &&
                    input(
                      "linkedinUrl",
                      "LinkedIn profile URL",
                      "https://linkedin.com/in/you",
                      "url",
                    )}
                </div>
              )}
              {step === 6 && (
                <>
                  <OnboardingPlans />
                  {schoolVerified && (
                    <div className="ob-notice" role="status">
                      {studentClaimStatus === "verified"
                        ? "Your student discount is verified."
                        : "School email verified. Confirm current enrollment through your university."}
                    </div>
                  )}
                  {studentClaimStatus !== "verified" && (
                    <div className="ob-fields">
                      <label className="ob-field">
                        <span>Your school email</span>
                        <input
                          className="field"
                          type="email"
                          value={schoolEmail}
                          onChange={(e) => {
                            setSchoolEmail(e.target.value);
                            setCodeSent(false);
                            setError("");
                          }}
                          placeholder="you@university.edu"
                          autoComplete="email"
                          maxLength={254}
                          required
                        />
                      </label>
                      {codeSent && (
                        <>
                          <label className="ob-field">
                            <span>Verification code</span>
                            <input
                              className="field"
                              value={studentCode}
                              onChange={(e) =>
                                setStudentCode(
                                  e.target.value.replace(/\D/g, "").slice(0, 6),
                                )
                              }
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              pattern="[0-9]{6}"
                              placeholder="6-digit code"
                              required
                            />
                          </label>
                          <button
                            className="ob-back"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setCodeSent(false);
                              setStudentCode("");
                            }}
                          >
                            Use a different email or resend
                          </button>
                        </>
                      )}
                      <p className="ob-help">
                        Verify current enrollment with your university. One
                        student offer per school email.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
            {error && (
              <p className="ob-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="ob-notice" role="status">
                {notice}
              </p>
            )}
            <div className="ob-actions">
              <button
                type="button"
                className="ob-back"
                onClick={() => (step > 0 ? move(step - 1) : router.push("/"))}
                disabled={busy}
              >
                ← Back
              </button>
              <button
                type="submit"
                className="ob-continue"
                disabled={busy || !ready}
              >
                {busy
                  ? "One moment…"
                  : step === 6
                    ? studentClaimStatus === "verified"
                      ? "See student pricing"
                      : !email
                        ? "Sign in to verify"
                        : !useEmailCode
                          ? "Verify with university"
                          : schoolVerified
                            ? "See student pricing"
                            : codeSent
                              ? "Verify email & continue"
                              : "Send verification code"
                    : "Continue"}
                <span aria-hidden>↗</span>
              </button>
            </div>
            {step === 6 && (
              <div className="ob-free-actions">
                <button
                  className="ob-free-continue"
                  type="button"
                  disabled={busy}
                  onClick={() => finish(false)}
                >
                  Continue with Free <span aria-hidden>→</span>
                </button>
                {email && studentClaimStatus !== "verified" && (
                  <button
                    type="button"
                    className="ob-back"
                    onClick={() => {
                      setUseEmailCode(!useEmailCode);
                      setError("");
                    }}
                  >
                    {useEmailCode
                      ? "Verify through my university instead"
                      : "Verify school inbox instead"}
                  </button>
                )}
                {!email && (
                  <Link href={guestFeed()}>Explore without an account</Link>
                )}
              </div>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
