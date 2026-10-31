const assert = require("node:assert/strict");
const test = require("node:test");
const { loadQuizzes } = require("./questions");

const { quizzes, ultimate } = loadQuizzes();

test("loads all source practice sets with their available questions", () => {
  assert.equal(quizzes.length, 13);
  assert.deepEqual(
    quizzes
      .filter((quiz) => quiz.format === "raw")
      .map((quiz) => quiz.questions.length),
    [100, 100, 100],
  );
  assert.deepEqual(
    quizzes
      .filter((quiz) => quiz.format === "detailed")
      .map((quiz) => quiz.questions.length),
    [30, 30, 30, 30, 30, 30, 10, 5, 30, 30],
  );
});

test("builds the ultimate test from unique question IDs", () => {
  assert.equal(ultimate.questions.length, 300);
  assert.equal(new Set(ultimate.questions.map((question) => question.id)).size, 300);
  assert.ok(!ultimate.questions[0].question.startsWith("001."));
});

test("every question has valid choices and at least one correct answer", () => {
  for (const quiz of [...quizzes, ultimate]) {
    for (const question of quiz.questions) {
      const optionKeys = new Set(question.options.map((option) => option.key));
      assert.ok(question.question, `${quiz.id} question ${question.id} has no prompt`);
      assert.ok(question.options.length >= 2, `${quiz.id} question ${question.id} has too few options`);
      assert.ok(question.answers.length > 0, `${quiz.id} question ${question.id} has no answer`);
      assert.ok(question.answers.every((answer) => optionKeys.has(answer)));
    }
  }
});

test("answer options do not contain bold Markdown formatting", () => {
  for (const quiz of [...quizzes, ultimate]) {
    for (const question of quiz.questions) {
      for (const option of question.options) {
        assert.ok(
          !option.text.includes("**"),
          `${quiz.id} question ${question.id} option ${option.key} contains bold Markdown`,
        );
      }
    }
  }
});

test("ultimate questions prefer detailed explanations when available", () => {
  const detailedIds = new Set(
    quizzes
      .filter((quiz) => quiz.format === "detailed")
      .flatMap((quiz) => quiz.questions.map((question) => question.id)),
  );
  const explained = ultimate.questions.find((question) => question.id === "001");
  const rawOnly = ultimate.questions.find(
    (question) => !detailedIds.has(question.id),
  );

  assert.ok(explained.explanation.length > 0);
  assert.ok(rawOnly);
  assert.equal(rawOnly.explanation, "");
});

test("questions expose detailed notes and source links in their feedback", () => {
  const detailedQuestion = quizzes
    .find((quiz) => quiz.id === "detailed-01")
    .questions.find((question) => question.id === "001");
  const matchingRawQuestion = quizzes
    .find((quiz) => quiz.id === "raw-01")
    .questions.find((question) => question.id === "001");

  assert.ok(detailedQuestion.importantNote.includes("Fairness"));
  assert.ok(detailedQuestion.sources.length > 0);
  assert.match(detailedQuestion.sources[0].url, /^https:\/\//);
  assert.ok(matchingRawQuestion.explanation);
  assert.deepEqual(matchingRawQuestion.sources, detailedQuestion.sources);
});
