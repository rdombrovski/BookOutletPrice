# BookOutlet.ca Book Search

## Description
An app for searching the discount book site bookoutlet.ca for books from a Goodreads library export CSV. Matched books are saved to a CSV file with their prices.

## Usage
Run the app from the command line:
```
node app.js
```

### Goodreads CSV Export
Export your Goodreads library at **My Books → Import and Export → Export Library**. Save the `.csv` file and note its path.

After running the script you will be asked:
```bash
? Path to your Goodreads library export CSV:
# Enter the path to the exported CSV (default: ./goodreads_library_export.csv)

? Which bookshelf to search? (e.g. to-read, read, currently-reading)
# Enter the exact shelf name you want to check against Book Outlet
```

Results are written to `bookoutlet_results.csv` in the project folder with headers:
`TITLE, AUTHOR, PRICE, NUM_PAGES, BOOKSHELF`

---

## Deprecated / No Longer Relevant

~~### GoodReads API~~

~~To be able to fetch lists from GoodReads you will need to get an API key which should be added into the `goodReadsRequestConfig` object in app.js, under the key `key`. More information on getting an API key can be found here: https://www.goodreads.com/api.~~

~~You can find your GoodReads ID by navigating to one of your lists and looking for the number inbetween 'list' and your username, e.g:~~
~~`https://www.goodreads.com/review/list/`**`94096085`**`-ben-unyolo?shelf=read`~~

~~After running the script you will be asked a few questions:~~

~~`? Do you want to search for books from a Good Reads shelf? (Y/n)` — type 'y' for goodreads shelf~~

~~`? What is your Good Reads ID?` — type goodreads ID~~

~~`? What shelf do you want to search?` — select 'Want to Read' or 'Other'~~

~~`? What is the name of the shelf?` — if not selecting 'Want to Read'~~

~~### User Created JSON List~~

~~You can also create your own list to search. Create a JSON file within the BookPrice folder in the following format:~~

~~`? Do you want to search for books from a Good Reads shelf? (Y/n)` — type 'n' for JSON list~~

~~`? What is the name of the JSON file with books?` — type the filename without `.json` extension~~

~~JSON format example:~~
~~`[{ "title": "Nineteen–Eighty Four", "author": "George Orwell" }, ...]`~~
