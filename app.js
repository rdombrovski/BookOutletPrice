const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const inquirer = require('inquirer');
const { parse } = require('csv-parse/sync');

let bookLonglist = [];
let finalArray = [];
const bookOutletDelay = 500;

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
      numPages: row['Number of Pages'] || '',
      shelf: (row['Exclusive Shelf'] || shelf).trim()
    }));
};

const compareLists = async () => {
  try {
    const totalBooks = bookLonglist.length;

    for (const [index, selectedBook] of bookLonglist.entries()) {
      console.log(`Searching ${index + 1} of ${totalBooks}: ${selectedBook.title}`);
      const matchedBooks = await searchBookOutlet(selectedBook);
      if (matchedBooks && matchedBooks.length > 0) {
        finalArray.push(...matchedBooks);
      }
    }

    console.log(`\nFound ${finalArray.length} book(s) available at Book Outlet.\n`);
    writeCSV(finalArray);
  } catch (error) {
    console.log(`ERROR AT: ${compareLists.name}`);
    console.log(error);
  }
};

const searchBookOutlet = async (selectedBook) => {
  const bookURI = encodeURIComponent(selectedBook.title).replace(/%20/g, '+');
  const authorURI = encodeURIComponent(selectedBook.author).replace(/%20/g, '+');

  const titleArray = await fetchBookOutletSearch(bookURI, 'Title');
  await delay(bookOutletDelay);

  if (titleArray.length === 0) return null;

  const authorArray = await fetchBookOutletSearch(authorURI, 'Author');
  await delay(bookOutletDelay);

  return titleArray
    .filter(titleBook =>
      authorArray.some(authorBook =>
        titleBook.title === authorBook.title && titleBook.author === authorBook.author
      )
    )
    .map(book => ({
      ...book,
      numPages: selectedBook.numPages,
      shelf: selectedBook.shelf
    }));
};

const fetchBookOutletSearch = async (term, category) => {
  try {
    const response = await axios.get(
      `https://bookoutlet.ca/Store/Browse?q=${term}&qf=${category}&size=24&sort=relevance_1&view=list`
    );
    return processBookOutletResponse(response);
  } catch (error) {
    console.log(`ERROR AT: ${fetchBookOutletSearch.name} — ${error.message}`);
    return [];
  }
};

const processBookOutletResponse = (response) => {
  const $ = cheerio.load(response.data);
  const info = $('div[itemtype="http://schema.org/Book"] > .col-9');
  const bookArray = [];

  info.find('a:first-child').each((i, el) => {
    bookArray.push({
      title: $(el).text(),
      author: '',
      price: '',
      url: `https://bookoutlet.ca${$(el).attr('href')}`
    });
  });

  info.children('p:first-child').each((i, el) => {
    let item = $(el).children().remove().end().text().trim();
    bookArray[i].author = item.split(', ').reverse().join(' ');
  });

  info.find('h6 > span:nth-child(2)').each((i, el) => {
    bookArray[i].price = $(el).text().replace(/[^0-9.]+/g, '');
  });

  return bookArray;
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
