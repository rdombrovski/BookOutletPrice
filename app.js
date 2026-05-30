const fs = require('fs');
const path = require('path');
const axios = require('axios');
const inquirer = require('inquirer');
const { parse } = require('csv-parse/sync');

let bookLonglist = [];
let finalArray = [];

// Constructor.io is Book Outlet's search backend — public client key embedded in their JS
const CIO_KEY = 'key_udjk7sSacp6D0sVq';
const CIO_QS = JSON.stringify({
  pre_filter_expression: {
    and: [
      { name: 'restricted_ca', value: false },
      { name: 'quantity', range: [1, 'inf'] }
    ]
  }
});
const CIO_DELAY = 300;
const OL_COVER = 'https://covers.openlibrary.org/b/isbn';
const BO_SEARCH = 'https://www.bookoutlet.ca/Store/Browse';

const questions = [
  {
    type: 'input',
    name: 'csvPath',
    message: 'Path to your Goodreads library export CSV:',
    default: './goodreads_library_export.csv'
  },
  {
    type: 'input',
    name: 'shelf',
    message: 'Which bookshelf to search? (e.g. to-read, read, currently-reading)',
    default: 'to-read'
  }
];

inquirer
  .prompt(questions)
  .then(async answers => {
    bookLonglist = loadGoodreadsCSV(answers.csvPath, answers.shelf);
    console.log(`\nLoaded ${bookLonglist.length} books from "${answers.shelf}" shelf.\n`);
    await compareLists();
  })
  .catch(error => {
    console.log(error);
  });

const loadGoodreadsCSV = (csvPath, shelf) => {
  const content = fs.readFileSync(path.resolve(csvPath), 'utf8');
  const records = parse(content, { columns: true, skip_empty_lines: true });
  return records
    .filter(row => {
      const exclusiveShelf = (row['Exclusive Shelf'] || '').trim();
      const bookshelves = (row['Bookshelves'] || '').split(',').map(s => s.trim());
      return exclusiveShelf === shelf || bookshelves.includes(shelf);
    })
    .map(row => ({
      title: row['Title'],
      author: row['Author'],
      authorLF: row['Author l-f'],
      numPages: row['Number of Pages'] || '',
      shelf: (row['Exclusive Shelf'] || shelf).trim()
    }));
};

const compareLists = async () => {
  try {
    const totalBooks = bookLonglist.length;

    for (const [index, selectedBook] of bookLonglist.entries()) {
      console.log(`Searching ${index + 1} of ${totalBooks}: ${selectedBook.title}`);
      const match = await searchBookOutlet(selectedBook);
      if (match) finalArray.push(match);
      await delay(CIO_DELAY);
    }

    console.log(`\nFound ${finalArray.length} book(s) available at Book Outlet.\n`);
    writeJSON(finalArray);
    generateHTML(finalArray);
    writeCSV(finalArray);
  } catch (error) {
    console.log(`ERROR AT: ${compareLists.name}`);
    console.log(error);
  }
};

const searchBookOutlet = async (selectedBook) => {
  try {
    const resp = await axios.get(
      `https://ac.cnstrc.com/search/${encodeURIComponent(selectedBook.title)}`,
      {
        params: { key: CIO_KEY, qs: CIO_QS, num_results_per_page: 30, c: 'ciojs-client-2.x' }
      }
    );

    const results = resp.data.response?.results || [];
    const authorLF = (selectedBook.authorLF || '').toLowerCase().trim();

    const matches = results.filter(r => {
      const apiTitle = r.value.toLowerCase().trim();
      const csvTitle = selectedBook.title.toLowerCase().trim();
      const titleMatch = apiTitle === csvTitle || csvTitle.startsWith(apiTitle);
      const authorMatch = (r.data.author_1 || '').toLowerCase().trim() === authorLF;
      return titleMatch && authorMatch;
    });

    if (matches.length === 0) return null;

    const cheapest = matches.reduce((best, r) => {
      const price = r.data.sale_price_cad ?? r.data.regular_price_cad ?? Infinity;
      const bestPrice = best.data.sale_price_cad ?? best.data.regular_price_cad ?? Infinity;
      return price < bestPrice ? r : best;
    });

    const price = cheapest.data.sale_price_cad ?? cheapest.data.regular_price_cad;
    const isbn = (cheapest.data.id || '').replace(/\D/g, '');
    const description = cheapest.data.overview || '';
    const imageUrl = isbn ? `${OL_COVER}/${isbn}-M.jpg` : '';
    const storeUrl = isbn
      ? `${BO_SEARCH}?q=${isbn}&size=24`
      : `${BO_SEARCH}?q=${encodeURIComponent(selectedBook.title)}&size=24`;

    return {
      title: selectedBook.title,
      author: selectedBook.author,
      price,
      numPages: selectedBook.numPages,
      shelf: selectedBook.shelf,
      isbn,
      description,
      imageUrl,
      storeUrl
    };
  } catch (error) {
    console.log(`  ERROR searching "${selectedBook.title}": ${error.message}`);
    return null;
  }
};

const writeCSV = (books) => {
  const outputPath = 'bookoutlet_results.csv';
  const esc = str => `"${String(str || '').replace(/"/g, '""')}"`;
  const header = 'TITLE,AUTHOR,PRICE,NUM_PAGES,BOOKSHELF';
  const rows = books.map(book =>
    [esc(book.title), esc(book.author), book.price, book.numPages, esc(book.shelf)].join(',')
  );
  fs.writeFileSync(outputPath, [header, ...rows].join('\n'), 'utf8');
  console.log(`Results saved to bookoutlet_results.csv`);
};

const writeJSON = (books) => {
  fs.writeFileSync('bookoutlet_results.json', JSON.stringify(books, null, 2), 'utf8');
  console.log(`Data saved to bookoutlet_results.json`);
};

const generateHTML = (books) => {
  const h = str => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmtPrice = p => `$${Number(p).toFixed(2)} CAD`;

  const gridCards = books.map(book => `
    <a class="grid-card" href="${h(book.storeUrl)}" target="_blank" rel="noopener" title="${h(book.title)} — ${h(book.author)}">
      <div class="cover-wrap">
        <img src="${h(book.imageUrl)}" alt="${h(book.title)}" loading="lazy" onerror="this.parentNode.classList.add('no-cover');this.remove()">
        <span class="no-cover-label">${h(book.title.slice(0, 30))}</span>
      </div>
      <div class="grid-price">${fmtPrice(book.price)}</div>
    </a>`).join('');

  const listRows = books.map(book => `
    <a class="list-row" href="${h(book.storeUrl)}" target="_blank" rel="noopener">
      <div class="list-cover-wrap">
        <img src="${h(book.imageUrl)}" alt="${h(book.title)}" loading="lazy" onerror="this.parentNode.classList.add('no-cover');this.remove()">
        <span class="no-cover-label">${h(book.title.slice(0, 20))}</span>
      </div>
      <div class="list-info">
        <div class="list-title">${h(book.title)}</div>
        <div class="list-author">${h(book.author)}</div>
        <div class="list-desc">${h(book.description)}</div>
      </div>
      <div class="list-price">${fmtPrice(book.price)}</div>
    </a>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Book Outlet Finds</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f2ede8;
      color: #1a1a1a;
      min-height: 100vh;
    }

    /* ── Header ── */
    header {
      background: #1c1c1e;
      color: #fff;
      padding: 1.25rem 2rem;
      display: flex;
      align-items: center;
      gap: 1.5rem;
      position: sticky;
      top: 0;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    header h1 { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.3px; }
    .count { opacity: 0.5; font-size: 0.85rem; }

    /* ── View toggle ── */
    .view-toggle {
      margin-left: auto;
      display: flex;
      gap: 0.25rem;
      background: rgba(255,255,255,0.1);
      padding: 0.25rem;
      border-radius: 6px;
    }
    .view-toggle button {
      padding: 0.3rem 0.85rem;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: rgba(255,255,255,0.7);
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 500;
      transition: background 0.15s, color 0.15s;
    }
    .view-toggle button.active {
      background: #fff;
      color: #1c1c1e;
    }

    .hidden { display: none !important; }

    /* ── Shared cover wrapper ── */
    .cover-wrap, .list-cover-wrap {
      position: relative;
      background: #d6cfc6;
      border-radius: 4px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .cover-wrap img, .list-cover-wrap img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    /* placeholder text shown via CSS when image fails */
    .no-cover-label {
      display: none;
      position: absolute;
      inset: 0;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0.5rem;
      font-size: 0.65rem;
      font-weight: 600;
      color: #6b5e52;
      line-height: 1.3;
    }
    .no-cover .no-cover-label { display: flex; }

    /* ── Grid view ── */
    #grid-view {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      padding: 2rem;
      align-items: flex-start;
    }
    .grid-card {
      width: 150px;
      text-decoration: none;
      color: inherit;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      transition: transform 0.15s;
    }
    .grid-card:hover { transform: translateY(-3px); }
    .grid-card .cover-wrap {
      width: 150px;
      height: 210px;
      box-shadow: 0 3px 10px rgba(0,0,0,0.2);
    }
    .grid-price {
      font-size: 0.85rem;
      font-weight: 700;
      color: #2a7d2a;
      text-align: center;
    }

    /* ── List view ── */
    #list-view {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 2rem;
      max-width: 900px;
      margin: 0 auto;
    }
    .list-row {
      display: flex;
      gap: 1rem;
      background: #fff;
      border-radius: 8px;
      padding: 1rem;
      text-decoration: none;
      color: inherit;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      align-items: flex-start;
      transition: box-shadow 0.15s;
    }
    .list-row:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.14); }
    .list-cover-wrap {
      width: 72px;
      height: 104px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
    .list-info { flex: 1; min-width: 0; }
    .list-title {
      font-weight: 700;
      font-size: 0.95rem;
      margin-bottom: 0.2rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .list-author {
      color: #666;
      font-size: 0.8rem;
      margin-bottom: 0.5rem;
    }
    .list-desc {
      color: #444;
      font-size: 0.78rem;
      line-height: 1.55;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .list-price {
      font-weight: 700;
      color: #2a7d2a;
      font-size: 0.9rem;
      white-space: nowrap;
      flex-shrink: 0;
      padding-top: 0.25rem;
      text-align: right;
    }
  </style>
</head>
<body>
  <header>
    <h1>Book Outlet Finds</h1>
    <span class="count">${books.length} book${books.length !== 1 ? 's' : ''} in stock</span>
    <div class="view-toggle">
      <button id="btn-grid" class="active" onclick="setView('grid')">Grid</button>
      <button id="btn-list" onclick="setView('list')">List</button>
    </div>
  </header>

  <div id="grid-view">${gridCards}
  </div>

  <div id="list-view" class="hidden">${listRows}
  </div>

  <script>
    function setView(v) {
      document.getElementById('grid-view').classList.toggle('hidden', v !== 'grid');
      document.getElementById('list-view').classList.toggle('hidden', v !== 'list');
      document.getElementById('btn-grid').classList.toggle('active', v === 'grid');
      document.getElementById('btn-list').classList.toggle('active', v === 'list');
    }
  </script>
</body>
</html>`;

  fs.writeFileSync('bookoutlet_results.html', html, 'utf8');
  console.log(`Page saved to bookoutlet_results.html`);
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
