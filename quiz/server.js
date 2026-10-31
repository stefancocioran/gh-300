const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { loadQuizzes } = require("./questions");

const WEB_DIR = __dirname;
const { quizzes, ultimate } = loadQuizzes();
const quizById = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
quizById.set(ultimate.id, ultimate);

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
]);

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end("Method not allowed");
    return;
  }

  const requestUrl = new URL(request.url, "http://127.0.0.1");
  if (requestUrl.pathname === "/api/quizzes") {
    sendJson(response, 200, {
      quizzes: quizzes.map(({ questions, ...quiz }) => ({
        ...quiz,
        questionCount: questions.length,
      })),
      ultimate: {
        id: ultimate.id,
        title: ultimate.title,
        questionCount: ultimate.questions.length,
      },
    });
    return;
  }

  const quizMatch = /^\/api\/quizzes\/([a-z]+-\d+|ultimate)$/.exec(
    requestUrl.pathname,
  );
  if (quizMatch) {
    const quiz = quizById.get(quizMatch[1]);
    if (!quiz) {
      sendJson(response, 404, { error: "Practice test not found" });
      return;
    }
    sendJson(response, 200, quiz);
    return;
  }

  const staticFile = staticFiles.get(requestUrl.pathname);
  if (!staticFile) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const [fileName, contentType] = staticFile;
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(path.join(WEB_DIR, fileName)).pipe(response);
});

const port = Number(process.env.PORT ?? 4173);
server.listen(port, "127.0.0.1", () => {
  console.log(`Practice quizzes are ready at http://127.0.0.1:${port}`);
  console.log(
    `${quizzes.length} source sets and ${ultimate.questions.length} unique questions loaded.`,
  );
});
