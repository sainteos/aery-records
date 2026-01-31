document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".brand").forEach((brand) => {
    // don’t add twice
    if (brand.querySelector(".brand-logo")) return;

    const img = document.createElement("img");
    img.className = "brand-logo";
    img.src = "/img/aeryrecordslogosmall.png";
    img.alt = "aery records logo";

    // put it before the text
    brand.insertBefore(img, brand.firstChild);
  });
});