export const searchEmbeddingVersion = "local-hash-v1";
export const searchEmbeddingDimensions = 48;

export type SearchEmbeddingVector = number[];

export type HybridSearchScore = {
  textScore: number;
  vectorScore: number;
  businessScore: number;
  totalScore: number;
  reasons: string[];
};

// 混合检索的第一阶段 embedding 使用本地 hashing，保证离线、可测，并为后续 pgvector 迁移保留固定维度。
export function createSearchEmbedding(text: string): SearchEmbeddingVector {
  const terms = expandSearchTerms(text);
  const vector = Array.from({ length: searchEmbeddingDimensions }, () => 0);

  for (const term of terms) {
    const weight = resolveTermWeight(term);
    const index = positiveHash(term) % searchEmbeddingDimensions;
    const sign = positiveHash(`${term}:sign`) % 2 === 0 ? 1 : -1;
    vector[index] += sign * weight;
  }

  return normalizeVector(vector);
}

export function scoreHybridTextMatch(query: string | undefined, text: string) {
  const terms = expandSearchTerms(query ?? "");
  const normalizedText = normalizeSearchText(text);
  let score = 0;
  const matchedTerms: string[] = [];

  for (const term of terms) {
    if (!term || !normalizedText.includes(term)) {
      continue;
    }

    score += term.length >= 2 ? 8 : 3;
    matchedTerms.push(term);
  }

  return {
    score,
    matchedTerms: uniqueStrings(matchedTerms).slice(0, 12),
  };
}

export function cosineSimilarity(left: SearchEmbeddingVector | undefined, right: SearchEmbeddingVector | undefined) {
  if (!left?.length || !right?.length || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function parseSearchEmbedding(value: unknown): SearchEmbeddingVector | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const vector = value.map((item) => (typeof item === "number" && Number.isFinite(item) ? item : 0));

  return vector.length === searchEmbeddingDimensions ? vector : undefined;
}

export function buildEmbeddingText(parts: Array<string | string[] | number | null | undefined>) {
  return uniqueStrings(
    parts.flatMap((part) => {
      if (Array.isArray(part)) {
        return part;
      }

      if (typeof part === "number") {
        return String(part);
      }

      return part ? [part] : [];
    }),
  ).join(" | ");
}

export function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").trim();
}

export function expandSearchTerms(value: string) {
  const normalized = normalizeSearchText(value);

  if (!normalized) {
    return [];
  }

  const terms = new Set<string>();
  for (const rawTerm of value
    .toLowerCase()
    .split(/[\s,，。.!！？、;；:：/|()（）【】\[\]{}"'“”‘’+-]+/)
    .map((term) => normalizeSearchText(term))
    .filter((term) => term.length > 0 && !isGenericSearchTerm(term))) {
    terms.add(rawTerm);
    for (const gram of createCharacterGrams(rawTerm)) {
      terms.add(gram);
    }
  }

  for (const [pattern, additions] of semanticSearchSynonyms) {
    if (pattern.test(normalized)) {
      additions.map(normalizeSearchText).forEach((term) => terms.add(term));
    }
  }

  return [...terms].filter((term) => term.length > 0 && !isGenericSearchTerm(term));
}

export function uniqueStrings(values: Array<string | undefined | null>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function createCharacterGrams(term: string) {
  if (term.length <= 2) {
    return [term];
  }

  const grams = new Set<string>();
  for (let size = 2; size <= Math.min(4, term.length); size += 1) {
    for (let index = 0; index <= term.length - size; index += 1) {
      grams.add(term.slice(index, index + size));
    }
  }

  return [...grams];
}

function resolveTermWeight(term: string) {
  if (term.length >= 4) {
    return 1.4;
  }

  if (term.length >= 2) {
    return 1;
  }

  return 0.5;
}

function normalizeVector(vector: SearchEmbeddingVector) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));

  if (norm === 0) {
    return vector;
  }

  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function positiveHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function isGenericSearchTerm(term: string) {
  return /^(这个|这套|这批|那个|那套|之前|上次|刚才|刚刚|上一个|上一套|计划|训练|动作|推荐|帮我|按|把|改成|调整|说明|想|需要|一个|一套|the|a|an|for|to|of|and)$/.test(
    term,
  );
}

const semanticSearchSynonyms: Array<[RegExp, string[]]> = [
  [/拜拜肉|手臂后侧|蝴蝶袖/, ["肱三头肌", "三头肌", "手臂", "上臂后侧", "triceps", "isolation", "push"]],
  [/核心不稳|核心弱|腰腹不稳|稳定性/, ["核心", "腹部", "抗旋转", "平板支撑", "core", "anti_rotation", "stability"]],
  [/圆肩|含胸|驼背|肩胛/, ["肩部", "背部", "胸肩拉伸", "肩胛稳定", "posture", "pull", "mobility"]],
  [/练胸|胸肌|胸部/, ["胸", "胸肌", "胸部", "chest", "push"]],
  [/练腿|腿部|下肢/, ["腿", "腿部", "下肢", "股四头肌", "臀部", "squat", "lunge"]],
  [/背|背部/, ["背", "背部", "背阔肌", "pull", "row"]],
  [/肩|肩部/, ["肩", "肩部", "三角肌", "shoulder"]],
  [/臀|臀部|翘臀/, ["臀", "臀部", "glutes", "hinge", "bridge"]],
  [/自重|徒手|无器械|居家/, ["自重", "徒手", "无器械", "居家", "bodyweight", "home_friendly"]],
  [/热身|激活/, ["热身", "激活", "warmup", "activation"]],
  [/拉伸|放松|活动度/, ["拉伸", "放松", "活动度", "stretch", "mobility", "recovery"]],
  [/长期|每周|周期|计划/, ["plan", "长期计划", "weekly", "progression"]],
  [/单次|这套|训练流程|编排/, ["routine", "单次训练", "session"]],
];
