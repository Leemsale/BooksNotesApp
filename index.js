import express from "express";
import axios from "axios";
import { body, validationResult } from 'express-validator';
import env from "dotenv";
import fs from "fs";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const app = express();
const port = 3000;
env.config();

// Get the directory name from the current module's URL
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// File path for JSON data
const dataFilePath = path.join(__dirname, 'books.json');

// Middleware configuration
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Helper function to read the JSON file
const readBooksData = () => {
    const data = fs.readFileSync(dataFilePath, 'utf8');
    return JSON.parse(data);
};

// Helper function to write to the JSON file
const writeBooksData = (data) => {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
};

// Validation rules for book input
const bookValidationRules = [
    body('title').notEmpty().withMessage('Title is required'),
    body('author').notEmpty().withMessage('Author name is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be a whole number between 1 & 5')
];

// GET route for fetching and displaying all books on the homepage
app.get("/", async (req, res) => {
    const { sort, search } = req.query;
    let books = readBooksData();
    
    // Apply sorting
    if (sort === 'rating') {
        books.sort((a, b) => b.rating - a.rating);
    } else if (sort === 'alphabetical') {
        books.sort((a, b) => a.title.localeCompare(b.title));
    }

    // Apply search filter
    if (search) {
        books = books.filter(book => 
            book.title.toLowerCase().includes(search.toLowerCase()) || 
            book.author.toLowerCase().includes(search.toLowerCase())
        );
    }

    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;

    // For each book, fetch the cover image or use a default one if not available
    const updatedBooks = await Promise.all(books.map(async (book) => {
        if (book.cover_identifier) {
            try {
                const response = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${book.cover_identifier}&key=${apiKey}`);
                const items = response.data.items;

                if (items && items.length > 0) {
                    const bookData = items[0];
                    const bookId = bookData.id;
                    book.cover_url = `https://books.google.com/books/content?id=${bookId}&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs-api`;
                } else {
                    book.cover_url = 'https://www.press.uillinois.edu/books/images/no_cover.jpg';
                }
            } catch (error) {
                book.cover_url = 'https://www.press.uillinois.edu/books/images/no_cover.jpg';
            }
        } else {
            book.cover_url = 'https://www.press.uillinois.edu/books/images/no_cover.jpg';
        }
        return book;
    }));

    const noResults = updatedBooks.length === 0;
    res.render("index.ejs", { books: updatedBooks, isIndexPage: true, noResults, search });
});

// GET route to render the form for adding a new book
app.get("/books/add", (req, res) => {
    res.render("addBook.ejs", { isIndexPage: false });
});

// POST route for adding a new book
app.post("/books", bookValidationRules, (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).render('error.ejs', { errors: errors.array(), isIndexPage: false });
    }
    const { title, author, rating, isbn, notes } = req.body;
    const books = readBooksData();

    // Generate a new ID
    const newId = books.length > 0 ? books[books.length - 1].id + 1 : 1;

    const newBook = { id: newId, title, author, rating: parseInt(rating), cover_identifier: isbn, notes };
    books.push(newBook);
    writeBooksData(books);

    res.redirect("/");
});

// GET route to render the form for editing an existing book
app.get("/books/edit/:id", (req, res) => {
    const bookId = parseInt(req.params.id);
    const books = readBooksData();
    const book = books.find(b => b.id === bookId);

    res.render("editBook.ejs", { book, isIndexPage: false });
});

// POST route to update an existing book
app.post("/books/edit/:id", bookValidationRules, (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).render('error.ejs', { errors: errors.array(), isIndexPage: false });
    }

    const bookId = parseInt(req.params.id);
    const { title, author, rating, isbn, notes } = req.body;
    const books = readBooksData();

    const bookIndex = books.findIndex(b => b.id === bookId);
    if (bookIndex !== -1) {
        books[bookIndex] = { id: bookId, title, author, rating: parseInt(rating), cover_identifier: isbn, notes };
        writeBooksData(books);
    }

    res.redirect("/");
});

// POST route to delete a book
app.post("/books/delete/:id", (req, res) => {
    const bookId = parseInt(req.params.id);
    let books = readBooksData();
    books = books.filter(book => book.id !== bookId);
    writeBooksData(books);

    res.redirect("/");
});

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error.ejs', { errors: [{ msg: err.message }], isIndexPage: false });
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
