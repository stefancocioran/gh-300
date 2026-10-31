const fs = require("node:fs");
const path = require("node:path");

const PRACTICE_DIR = path.join(__dirname, "..", "source", "docs", "practice");

function parseOptions(optionsText, sourceFile, questionId) {
  const optionMatches = [...optionsText.matchAll(/^([A-Z])\.\s*(.*)$/gm)];
  const options = optionMatches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = optionMatches[index + 1]?.index ?? optionsText.length;
    const continuation = optionsText.slice(start, end).trim();
    const text = [match[2], continuation]
      .filter(Boolean)
      .join(" ")
      .trim()
      .replace(/\*\*(.*?)\*\*/g, "$1");
    return {
      key: match[1],
      text,
    };
  });

  if (options.length < 2 || options.some((option) => !option.text)) {
    throw new Error(
      `${sourceFile}: question ${questionId} must have at least two non-empty options`,
    );
  }

  return options;
}

function parseAnswers(answerText, options, sourceFile, questionId) {
  const answers = [...new Set(answerText.match(/[A-Z]/g) ?? [])];
  const optionKeys = new Set(options.map((option) => option.key));

  if (
    answers.length === 0 ||
    answers.some((answer) => !optionKeys.has(answer))
  ) {
    throw new Error(
      `${sourceFile}: question ${questionId} has an invalid correct answer`,
    );
  }

  return answers;
}

function extractSection(questionText, heading, stopHeadings) {
  const headingPattern = new RegExp(
    `^\\*\\*${heading}:\\*\\*[ \\t]*\\r?\\n`,
    "m",
  );
  const match = headingPattern.exec(questionText);
  if (!match) return "";

  const contentStart = match.index + match[0].length;
  const rest = questionText.slice(contentStart);
  if (stopHeadings.length === 0) return rest.trim();

  const stopPattern = new RegExp(
    `^(?:${stopHeadings
      .map((item) => `\\*\\*${item}:\\*\\*`)
      .join("|")}|> \\[!IMPORTANT\\])`,
    "m",
  );
  const nextHeading = stopPattern.exec(rest);
  return rest.slice(0, nextHeading?.index ?? rest.length).trim();
}

function extractImportantNote(questionText) {
  const match = /^> \[!IMPORTANT\][ \t]*\r?\n((?:>.*(?:\r?\n|$))+)/m.exec(
    questionText,
  );
  return match
    ? match[1]
        .split(/\r?\n/)
        .map((line) => line.replace(/^>\s?/, ""))
        .join("\n")
        .trim()
    : "";
}

function parseSources(sourceText) {
  return [...sourceText.matchAll(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)(?:\s+\(([^)]+)\))?/gm)].map(
    (match) => ({
      title: match[1],
      url: match[2],
      publisher: match[3] ?? "",
    }),
  );
}

function parseRawQuestion(block, questionId, sourceFile) {
  const answerMatch =
    /^\*\*Correct Answer\(s\):\*\*\s*([A-Z,\s]+)$/im.exec(block);
  if (!answerMatch) {
    throw new Error(`${sourceFile}: question ${questionId} has no answer key`);
  }

  const questionContent = block.slice(0, answerMatch.index);
  const firstOption = /^([A-Z])\.\s*(.*)$/m.exec(questionContent);
  if (!firstOption) {
    throw new Error(`${sourceFile}: question ${questionId} has no options`);
  }

  const question = questionContent
    .slice(0, firstOption.index)
    .trim()
    .replace(/^\d{3}\.\s*/, "")
    .trim()
    .replace(/\s*\n\s*/g, " ");
  const options = parseOptions(
    questionContent.slice(firstOption.index),
    sourceFile,
    questionId,
  );

  return {
    id: questionId,
    question,
    options,
    answers: parseAnswers(answerMatch[1], options, sourceFile, questionId),
    explanation: "",
    tips: "",
    additionalFeedback: "",
    importantNote: "",
    sources: [],
  };
}

function parseDetailedQuestion(block, sourceFile) {
  const idMatch = /^\*\*Question:\*\*\s*\[(\d+)\]/m.exec(block);
  const optionsHeading = /^\*\*Options:\*\*[ \t]*\r?$/m.exec(block);
  const answerMatch =
    /^\*\*Correct Answer\(s\):\*\*\s*([A-Z,\s]+)$/im.exec(block);
  if (!idMatch || !optionsHeading || !answerMatch) {
    throw new Error(`${sourceFile}: malformed detailed question block`);
  }

  const questionId = idMatch[1];
  const questionStart = idMatch.index + idMatch[0].length;
  const question = block
    .slice(questionStart, optionsHeading.index)
    .trim()
    .replace(/\s*\n\s*/g, " ");
  const optionsStart = optionsHeading.index + optionsHeading[0].length;
  const options = parseOptions(
    block.slice(optionsStart, answerMatch.index),
    sourceFile,
    questionId,
  );

  return {
    id: questionId,
    question,
    options,
    answers: parseAnswers(answerMatch[1], options, sourceFile, questionId),
    explanation: extractSection(block, "Explanation", [
      "Tips and Tricks",
      "Correct and Wrong",
      "Source",
    ]),
    tips: extractSection(block, "Tips and Tricks", [
      "Correct and Wrong",
      "Source",
    ]),
    additionalFeedback: extractSection(block, "Correct and Wrong", ["Source"]),
    importantNote: extractImportantNote(block),
    sources: parseSources(extractSection(block, "Source", [])),
  };
}

function parseRawFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const questionStarts = [...source.matchAll(/^(\d{3})\.\s+/gm)];
  const sourceFile = path.basename(filePath);

  return questionStarts.map((match, index) => {
    const end = questionStarts[index + 1]?.index ?? source.length;
    return parseRawQuestion(
      source.slice(match.index, end),
      match[1],
      sourceFile,
    );
  });
}

function parseDetailedFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const questionStarts = [
    ...source.matchAll(/^\*\*Question:\*\*\s*\[(\d+)\]/gm),
  ];
  const sourceFile = path.basename(filePath);

  return questionStarts.map((match, index) => {
    const end = questionStarts[index + 1]?.index ?? source.length;
    return parseDetailedQuestion(
      source.slice(match.index, end),
      sourceFile,
    );
  });
}

function listQuizzes() {
  const quizzes = [];
  for (const format of ["detailed", "raw"]) {
    const directory = path.join(PRACTICE_DIR, format);
    const files = fs
      .readdirSync(directory)
      .filter((name) => name.endsWith(`-practice-test.${format}.md`))
      .sort();

    for (const file of files) {
      const number = file.match(/^(\d+)-/)?.[1];
      if (!number) {
        throw new Error(`Unexpected practice test filename: ${file}`);
      }

      const filePath = path.join(directory, file);
      const questions =
        format === "raw" ? parseRawFile(filePath) : parseDetailedFile(filePath);
      if (questions.length === 0) {
        throw new Error(`${file}: no questions found`);
      }

      quizzes.push({
        id: `${format}-${number}`,
        title: `${format === "raw" ? "Raw" : "Detailed"} Practice Test ${number}`,
        format,
        questions,
      });
    }
  }
  return quizzes;
}

function loadQuizzes() {
  const quizzes = listQuizzes();
  const questionBank = new Map();
  const detailedById = new Map(
    quizzes
      .filter((item) => item.format === "detailed")
      .flatMap((quiz) => quiz.questions.map((question) => [question.id, question])),
  );

  for (const quiz of quizzes.filter((item) => item.format === "raw")) {
    for (const question of quiz.questions) {
      if (questionBank.has(question.id)) {
        throw new Error(`Duplicate question ID ${question.id} in raw tests`);
      }
      const detailedQuestion = detailedById.get(question.id);
      if (detailedQuestion) {
        Object.assign(question, {
          explanation: detailedQuestion.explanation,
          tips: detailedQuestion.tips,
          additionalFeedback: detailedQuestion.additionalFeedback,
          importantNote: detailedQuestion.importantNote,
          sources: detailedQuestion.sources,
        });
      }
      questionBank.set(question.id, question);
    }
  }

  for (const quiz of quizzes.filter((item) => item.format === "detailed")) {
    for (const question of quiz.questions) {
      const rawQuestion = questionBank.get(question.id);
      questionBank.set(question.id, {
        ...rawQuestion,
        ...question,
      });
    }
  }

  const ultimate = {
    id: "ultimate",
    title: "Ultimate Practice Test",
    format: "ultimate",
    questions: [...questionBank.values()],
  };

  return { quizzes, ultimate };
}

module.exports = { loadQuizzes };
