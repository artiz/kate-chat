import { decodeHtmlEntities, stripHtml } from "../format";

describe("stripHtml", () => {
  it("drops multi-line scripts, styles and JSON-LD instead of leaking them as text", () => {
    const html = `<html><head><title>Кризисное топливо</title>
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "WebPage" }
</script>
<style>
.gChuqG{z-index:unset;clear:both;display:block;}
</style></head>
<body><script>
document.documentElement.classList.remove('no-js');
</script><p>В России растет потребление пропан-бутана.</p></body></html>`;

    expect(stripHtml(html)).toBe("В России растет потребление пропан-бутана.");
  });

  it("keeps the article body and drops the page chrome around it", () => {
    const html = `<body>
<header><a href="/">Авто.ру</a><a href="/add">Разместить объявление</a></header>
<nav>Легковые Мото Комтранс</nav>
<article><h1>Главное на топливном рынке</h1><p>На 7 сентября средняя стоимость литра составила 78,25 рубля.</p></article>
<footer>О проекте</footer>
</body>`;

    expect(stripHtml(html)).toBe(
      "Главное на топливном рынке\nНа 7 сентября средняя стоимость литра составила 78,25 рубля."
    );
  });

  it("separates adjacent elements instead of gluing their text into one word", () => {
    expect(stripHtml("<ul><li>Избранное</li><li>Войти</li></ul><span>Легковые</span><span>Мото</span>")).toBe(
      "Избранное\nВойти\nЛегковые Мото"
    );
  });

  it("decodes entities and collapses whitespace", () => {
    expect(stripHtml("<p>Tom &amp; Jerry&nbsp;&mdash;&#160;&quot;q&quot;   \n\n\n  next</p>")).toBe(
      'Tom & Jerry &mdash; "q"\nnext'
    );
  });

  it("returns an empty string for empty input", () => {
    expect(stripHtml(undefined)).toBe("");
    expect(stripHtml(null)).toBe("");
    expect(stripHtml("")).toBe("");
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes named and numeric entities once", () => {
    expect(decodeHtmlEntities("Caf&#233; &#x2014; &amp;#39; &lt;b&gt;")).toBe("Café — &#39; <b>");
  });

  it("leaves unknown and out-of-range references alone", () => {
    expect(decodeHtmlEntities("&mdash; &#0; &#x110000;")).toBe("&mdash; &#0; &#x110000;");
  });
});
