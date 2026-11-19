const monthInput = document.getElementById("report-month");
const report = document.getElementById("report");
const button = document.getElementById("copy-ai-request");
const status = document.getElementById("monthly-status");
const request = document.getElementById("ai-request");
request.previousElementSibling.hidden = true;
monthInput.value = today().slice(0, 7);

function updateMonthlyReport() {
  report.value = "";
  button.disabled = true;
  status.textContent = "";
  request.value = "";
  request.hidden = true;
  request.previousElementSibling.hidden = true;
  if (!monthInput.validity.valid || !/^\d{4}-\d{2}$/.test(monthInput.value)) {
    status.textContent = "보고 월을 선택해 주세요.";
    return;
  }
  try {
    const source = recordStorage.getItem(LOCAL_KEY);
    const journal = source
      ? parseJournal(source)
      : { days: {}, weeks: {}, schedule: [], reviews: [] };
    const start = monthInput.value + "-01";
    const [year, month] = monthInput.value.split("-").map(Number);
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const record = buildReport(journal, start, end, "월간");
    if (!/^\- (?!없음$).+/m.test(record)) {
      status.textContent = "이 달에 요약할 기록이 없습니다.";
      return;
    }
    report.value = record;
    button.disabled = false;
  } catch {
    status.textContent = "저장된 일지를 불러오지 못했습니다.";
  }
}
monthInput.oninput = updateMonthlyReport;
window.addEventListener("pageshow", updateMonthlyReport);
window.addEventListener("storage", (event) => {
  if (
    event.key === LOCAL_KEY ||
    event.key === CONTENT_KEY ||
    event.key === CONTENT_STATS_KEY ||
    event.key === null
  )
    updateMonthlyReport();
});

button.onclick = async () => {
  request.value = [
    "아래 마케팅 일지를 바탕으로 한국어 월간 업무 보고서를 작성해 주세요.",
    "핵심 성과, 행사·발행 결과, 사업부 검수 및 후속 조치 순으로 묶고, 비슷한 업무는 합쳐 주세요.",
    "완료·미완료·예정 상태를 구분하고 기록에 없는 수치나 성과는 추정하지 마세요.",
    "",
    report.value,
  ].join("\n");
  request.hidden = false;
  request.previousElementSibling.hidden = false;
  const copiedRequest = request.value;
  try {
    await navigator.clipboard.writeText(copiedRequest);
    if (request.value !== copiedRequest) return;
    status.textContent =
      "복사했습니다. ChatGPT에서 요청문을 확인하고 붙여넣으세요.";
  } catch {
    if (request.value !== copiedRequest) return;
    request.focus();
    request.select();
    status.textContent = "선택된 요청문을 복사해 주세요.";
  }
};
