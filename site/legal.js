const dialog = document.querySelector("#rightsDialog");
const openButtons = document.querySelectorAll("[data-legal-open]");

for (const button of openButtons) {
  button.addEventListener("click", () => {
    if (!dialog) {
      return;
    }
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  });
}

if (dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
}
