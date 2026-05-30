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
      authorLF: row['Author l-f'],   // "Last, First" — matches Constructor.io's author_1 field
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

    // filter to results that match this exact book (title + author)
    const matches = results.filter(r => {
      const apiTitle = r.value.toLowerCase().trim();
      const csvTitle = selectedBook.title.toLowerCase().trim();
      // allow series notation: "Book Title (Series, #1)" matches "Book Title"
      const titleMatch = apiTitle === csvTitle || csvTitle.startsWith(apiTitle);
      const authorMatch = (r.data.author_1 || '').toLowerCase().trim() === authorLF;
      return titleMatch && authorMatch;
    });

    if (matches.length === 0) return null;

    // pick the cheapest in-stock edition
    const cheapest = matches.reduce((best, r) => {
      const price = r.data.sale_price_cad ?? r.data.regular_price_cad ?? Infinity;
      const bestPrice = best.data.sale_price_cad ?? best.data.regular_price_cad ?? Infinity;
      return price < bestPrice ? r : best;
    });

    const price = cheapest.data.sale_price_cad ?? cheapest.data.regular_price_cad;

    return {
      title: selectedBook.title,
      author: selectedBook.author,
      price,
      numPages: selectedBook.numPages,
      shelf: selectedBook.shelf
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
  console.log(`Results saved to ${outputPath}`);
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
