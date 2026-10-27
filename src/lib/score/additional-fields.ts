/** Degree-language patterns: word boundaries keep ordinary prose out of the taxonomy. */
export const ADDITIONAL_FIELDS = {
  medicine:
    /\b(medicine|medical school|medical student|health sciences?|physician|pre-med)\b/i,
  nursing: /\b(nursing|nurse|patient care)\b/i,
  public_health: /\b(public health|epidemiology|health policy)\b/i,
  pharmacy: /\b(pharmacy|pharmacology|pharmacist)\b/i,
  dentistry: /\b(dentistry|dental (?:school|student|hygiene))\b/i,
  veterinary: /\b(veterinary|veterinarian|animal science)\b/i,
  biology:
    /\b(biology|biological sciences?|life sciences?|microbiology|genetics|neuroscience)\b/i,
  chemistry: /\b(chemistry|biochemistry|chemical sciences?)\b/i,
  physics: /\b(physics|astronomy|astrophysics)\b/i,
  mathematics: /\b(mathematics|mathematical sciences?|statistics)\b/i,
  engineering:
    /\b(engineering|civil engineer|chemical engineer|industrial engineer)\b/i,
  architecture: /\b(architecture|urban planning|architectural studies)\b/i,
  environment:
    /\b(environmental (?:science|studies|engineering)|sustainability|ecology|conservation biology)\b/i,
  agriculture:
    /\b(agriculture|agricultural sciences?|agronomy|food science|horticulture)\b/i,
  education:
    /\b(education (?:major|degree)|teacher education|teaching|early childhood education|special education)\b/i,
  psychology:
    /\b(psychology|psychological sciences?|counseling|counselling)\b/i,
  social_work: /\b(social work|human services)\b/i,
  law: /\b(law (?:schools?|students?|degrees?)|juris doctor|criminal justice|legal studies|paralegal)\b/i,
  politics:
    /\b(political science|public policy|international relations|public administration)\b/i,
  social_sciences: /\b(sociology|anthropology|social sciences?)\b/i,
  humanities:
    /\b(history (?:major|degree)|philosophy|humanities|classical studies)\b/i,
  languages:
    /\b(linguistics|language studies|foreign languages|literature|english (?:major|degree))\b/i,
  arts: /\b(fine arts|visual arts|graphic design|fashion design|art history|studio art)\b/i,
  performing_arts: /\b(music|theater|theatre|performing arts|dance)\b/i,
  media:
    /\b(journalism|media studies|mass communication|communications (?:major|degree)|film studies)\b/i,
  hospitality: /\b(hospitality|tourism|culinary arts|hotel management)\b/i,
  sports:
    /\b(kinesiology|exercise science|sports management|physical education)\b/i,
  trades:
    /\b(skilled trades|welding|electrician|plumbing|automotive technology|construction management)\b/i,
  library_science: /\b(library science|information science|library studies)\b/i,
  religion: /\b(religious studies|theology|divinity)\b/i,
} as const;
