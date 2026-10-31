const app = document.querySelector("#app");

let quizIndex = null;
let activeQuiz = null;
let questionIndex = 0;
let selectedAnswers = new Set();
let results = [];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function renderMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}

function renderRichText(value) {
  const blocks = value.split(/\n\s*\n/).filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split(/\r?\n/).filter(Boolean);
      if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
        return `<ul>${lines
          .map(
            (line) =>
              `<li>${renderMarkdown(line.replace(/^\s*[-*]\s+/, ""))}</li>`,
          )
          .join("")}</ul>`;
      }
      return `<p>${lines.map(renderMarkdown).join("<br>")}</p>`;
    })
    .join("");
}

function showLoadError() {
  app.innerHTML = `
    <div class="load-error">
      <strong>Could not load the practice tests.</strong>
      Start the local quiz server with <code>node quiz/server.js</code>, then
      open <code>http://127.0.0.1:4173</code>.
    </div>`;
}

async function loadQuizIndex() {
  const response = await fetch("/api/quizzes");
  if (!response.ok) throw new Error(`Quiz list request failed: ${response.status}`);
  quizIndex = await response.json();
  renderHome();
}

function renderQuizCards(quizzes, format) {
  return quizzes
    .map(
      (quiz) => `
        <button class="quiz-card" type="button" data-quiz-id="${escapeHtml(quiz.id)}">
          <span class="quiz-card-top">
            <span class="format-pill ${escapeHtml(format)}">${escapeHtml(format)}</span>
            <span class="quiz-card-count">${quiz.questionCount} questions</span>
          </span>
          <h3>${escapeHtml(quiz.title)}</h3>
          <span class="quiz-card-footer">
            <span>${format === "detailed" ? "Explanations included" : "Quick answer check"}</span>
            <span class="quiz-card-arrow" aria-hidden="true">→</span>
          </span>
        </button>`,
    )
    .join("");
}

function renderHome() {
  const detailed = quizIndex.quizzes.filter((quiz) => quiz.format === "detailed");
  const raw = quizIndex.quizzes.filter((quiz) => quiz.format === "raw");

  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Study smarter, one question at a time</p>
      <h1>Practice for GH-300.<br>Know where you stand.</h1>
      <p class="hero-copy">
        Choose a practice set for instant feedback, or take the Ultimate quiz
        across every unique question. Correct answers and any selected incorrect
        answers are highlighted after each submission.
      </p>
    </section>

    <button class="ultimate-card" type="button" data-quiz-id="ultimate">
      <span>
        <span class="ultimate-tag">Complete question bank</span>
        <h2>${escapeHtml(quizIndex.ultimate.title)}</h2>
        <p>
          All ${quizIndex.ultimate.questionCount} unique questions from the raw
          and detailed sets, with detailed explanations wherever available.
        </p>
      </span>
      <span class="primary-button">Start ultimate quiz <span aria-hidden="true">→</span></span>
    </button>

    <section aria-labelledby="detailed-heading">
      <div class="section-heading">
        <h2 id="detailed-heading">Detailed practice tests</h2>
        <span class="section-count">${detailed.length} sets · explanations included</span>
      </div>
      <div class="quiz-grid">${renderQuizCards(detailed, "detailed")}</div>
    </section>

    <section aria-labelledby="raw-heading">
      <div class="section-heading">
        <h2 id="raw-heading">Raw practice tests</h2>
        <span class="section-count">${raw.length} sets · quick answer check</span>
      </div>
      <div class="quiz-grid">${renderQuizCards(raw, "raw")}</div>
    </section>`;

  app.querySelectorAll("[data-quiz-id]").forEach((button) => {
    button.addEventListener("click", () => startQuiz(button.dataset.quizId));
  });
}

async function startQuiz(quizId) {
  app.innerHTML = '<div class="loading-panel">Preparing your quiz…</div>';
  try {
    const response = await fetch(`/api/quizzes/${encodeURIComponent(quizId)}`);
    if (!response.ok) {
      throw new Error(`Practice test request failed: ${response.status}`);
    }
    activeQuiz = await response.json();
    questionIndex = 0;
    selectedAnswers = new Set();
    results = [];
    renderQuestion();
  } catch (error) {
    console.error(error);
    showLoadError();
  }
}

function renderFeedback(question, isCorrect) {
  const answerText = question.answers.join(", ");
  const detailSections = [
    question.explanation
      ? `<section class="explanation-section"><h4>Why this is correct</h4>${renderRichText(question.explanation)}</section>`
      : "",
    question.tips
      ? `<section class="explanation-section"><h4>Study tip</h4>${renderRichText(question.tips)}</section>`
      : "",
    question.additionalFeedback
      ? `<section class="explanation-section"><h4>Answer review</h4>${renderRichText(question.additionalFeedback)}</section>`
      : "",
    question.importantNote
      ? `<aside class="important-note"><span class="important-label">Key takeaway</span>${renderRichText(question.importantNote)}</aside>`
      : "",
    question.sources?.length
      ? `<section class="explanation-section sources-section"><h4>Sources</h4><ul>${question.sources
          .map(
            (source) => `
              <li>
                <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a>
                ${source.publisher ? `<span class="source-publisher">${escapeHtml(source.publisher)}</span>` : ""}
              </li>`,
          )
          .join("")}
        </ul>
      </section>`
      : "",
  ].join("");
  const hasDetails = Boolean(detailSections);
  const panelId = `explanation-${question.id}`;

  return `
    <div class="feedback ${isCorrect ? "" : "is-incorrect"}">
      <p class="feedback-title" role="status">${isCorrect ? "That's correct!" : "Not quite — review the highlighted answers."}</p>
      <p class="feedback-copy">Correct answer${question.answers.length > 1 ? "s" : ""}: <strong>${escapeHtml(answerText)}</strong></p>
      <button
        class="see-more-button"
        type="button"
        data-action="toggle-explanation"
        aria-expanded="false"
        aria-controls="${panelId}"
      >
        <span>See more</span><span class="see-more-icon" aria-hidden="true">⌄</span>
      </button>
      <div class="explanation-panel" id="${panelId}" hidden>
        ${
          hasDetails
            ? detailSections
            : '<p class="no-explanation">No additional explanation is available for this question in the current Markdown files.</p>'
        }
      </div>
    </div>`;
}

function renderQuestion() {
  if (questionIndex >= activeQuiz.questions.length) {
    renderResults();
    return;
  }

  const question = activeQuiz.questions[questionIndex];
  const submitted = results[questionIndex] !== undefined;
  const isCorrect = results[questionIndex] === true;
  const progress = ((questionIndex + 1) / activeQuiz.questions.length) * 100;
  const choices = question.options
    .map((option) => {
      const isSelected = selectedAnswers.has(option.key);
      const isCorrectAnswer = question.answers.includes(option.key);
      const choiceClass = [
        "choice",
        isSelected ? "is-selected" : "",
        submitted && isCorrectAnswer ? "is-correct" : "",
        submitted && isSelected && !isCorrectAnswer ? "is-wrong" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const inputType = question.answers.length > 1 ? "checkbox" : "radio";
      return `
        <label class="${choiceClass}" data-choice="${escapeHtml(option.key)}">
          <input
            type="${inputType}"
            name="answer"
            value="${escapeHtml(option.key)}"
            aria-label="Option ${escapeHtml(option.key)}"
            ${isSelected ? "checked" : ""}
            ${submitted ? "disabled" : ""}
          />
          <span class="choice-key">${escapeHtml(option.key)}</span>
          <span class="choice-text">${renderMarkdown(option.text)}</span>
        </label>`;
    })
    .join("");

  const feedback = submitted ? renderFeedback(question, isCorrect) : "";
  const nextLabel =
    questionIndex === activeQuiz.questions.length - 1
      ? "See results"
      : "Next question";

  app.innerHTML = `
    <div class="quiz-topbar">
      <div>
        <h1 class="quiz-title">${escapeHtml(activeQuiz.title)}</h1>
        <p class="quiz-subtitle">${activeQuiz.questions.length} questions · your progress is not saved</p>
      </div>
      <button class="back-link" type="button" data-action="home">← All practice tests</button>
    </div>
    <section class="quiz-shell">
      <div class="progress-area">
        <div class="progress-track" role="progressbar" aria-valuenow="${questionIndex + 1}" aria-valuemin="1" aria-valuemax="${activeQuiz.questions.length}" aria-label="Quiz progress">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <span class="progress-label">${questionIndex + 1} / ${activeQuiz.questions.length}</span>
      </div>
      <article class="question-card">
        <div class="question-meta">
          <span class="question-id">Question ${escapeHtml(question.id)}</span>
          <span>${question.answers.length > 1 ? "Select all that apply" : "Choose one answer"}</span>
        </div>
        <h2>${renderMarkdown(question.question)}</h2>
        <p class="question-instruction">${submitted ? "Answer feedback" : "Select your answer, then submit to see how you did."}</p>
        <div class="choices">${choices}</div>
        ${feedback}
        <div class="quiz-actions">
          ${
            submitted
              ? `<button class="primary-button" type="button" data-action="next">${nextLabel} <span aria-hidden="true">→</span></button>`
              : `<button class="primary-button" type="button" data-action="submit" ${selectedAnswers.size === 0 ? "disabled" : ""}>Submit answer <span aria-hidden="true">✓</span></button>`
          }
        </div>
      </article>
    </section>`;

  app.querySelectorAll('input[name="answer"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.type === "radio") {
        selectedAnswers = new Set([input.value]);
      } else if (input.checked) {
        selectedAnswers.add(input.value);
      } else {
        selectedAnswers.delete(input.value);
      }

      app.querySelectorAll(".choice").forEach((choice) => {
        choice.classList.toggle(
          "is-selected",
          selectedAnswers.has(choice.dataset.choice),
        );
      });
      const submit = app.querySelector('[data-action="submit"]');
      if (submit) submit.disabled = selectedAnswers.size === 0;
    });
  });

  app.querySelector('[data-action="submit"]')?.addEventListener("click", submitAnswer);
  app
    .querySelector('[data-action="toggle-explanation"]')
    ?.addEventListener("click", (event) => {
      const button = event.currentTarget;
      const panel = document.getElementById(button.getAttribute("aria-controls"));
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      button.querySelector("span").textContent = expanded ? "See more" : "See less";
      button.querySelector(".see-more-icon").textContent = expanded ? "⌄" : "⌃";
      panel.hidden = expanded;
    });
  app.querySelector('[data-action="next"]')?.addEventListener("click", () => {
    questionIndex += 1;
    selectedAnswers = new Set();
    renderQuestion();
  });
  app.querySelector('[data-action="home"]')?.addEventListener("click", renderHome);
}

function submitAnswer() {
  const question = activeQuiz.questions[questionIndex];
  const correct =
    selectedAnswers.size === question.answers.length &&
    question.answers.every((answer) => selectedAnswers.has(answer));
  results[questionIndex] = correct;
  renderQuestion();
}

function renderResults() {
  const correctCount = results.filter(Boolean).length;
  const percentage = Math.round((correctCount / activeQuiz.questions.length) * 100);
  const message =
    percentage >= 85
      ? "Excellent work — you know this material well."
      : percentage >= 65
        ? "Good progress. Review the questions you missed and try again."
        : "Keep practicing. The detailed sets can help reinforce the concepts.";

  app.innerHTML = `
    <div class="quiz-topbar">
      <div>
        <p class="eyebrow">Quiz complete</p>
        <h1 class="quiz-title">${escapeHtml(activeQuiz.title)}</h1>
      </div>
      <button class="back-link" type="button" data-action="home">← All practice tests</button>
    </div>
    <section class="result-card">
      <div class="result-icon" aria-hidden="true">${percentage >= 65 ? "✓" : "↻"}</div>
      <h2>That's a wrap.</h2>
      <p class="result-score">${correctCount}<span style="color:#9aa69e;font-size:30px"> / ${activeQuiz.questions.length}</span></p>
      <p class="result-caption">${percentage}% correct · ${escapeHtml(message)}</p>
      <div class="result-actions">
        <button class="secondary-button" type="button" data-action="retry">Try this test again</button>
        <button class="primary-button" type="button" data-action="home">Choose another test</button>
      </div>
    </section>`;

  app.querySelector('[data-action="home"]')?.addEventListener("click", renderHome);
  app.querySelector('[data-action="retry"]')?.addEventListener("click", () =>
    startQuiz(activeQuiz.id),
  );
}

loadQuizIndex().catch((error) => {
  console.error(error);
  showLoadError();
});
