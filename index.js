import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";
import { body, validationResult } from 'express-validator';
import env from "dotenv";

const app = express();
const port = 3000;
env.config();

// PostgreSQL client setup for connecting to the database
const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "book_notes",
    password: process.env.PASSWORD,
    port: 5432,
});
db.connect();

// Middleware configuration
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Validation rules for book input
const bookValidationRules = [
    body('title').notEmpty().withMessage('Title is required'),
    body('author').notEmpty().withMessage('Author name is required'),
    body('rating').isInt({ min: 1, max: 5}).withMessage('Rating must be a whole number between 1 & 5')
];

// GET route for fetching and displaying all books on the homepage
app.get("/", async (req, res, next) => {
    const { sort, search} = req.query;
    let sortQuery = '';
    let searchQuery = '';
    const searchValues = [];

    // Apply sorting and filtering based on user input
    if (sort === 'rating') {
        sortQuery = 'ORDER BY rating DESC';
    } else if (sort === 'alphabetical') {
        sortQuery = 'ORDER BY title ASC';
    }

    if (search) {
        searchQuery = `WHERE title ILIKE $1 OR author ILIKE $1`;
        searchValues.push(`%${search}%`);
    }

    try {
        // Fetch books from database with optional search and sorting
        const query = `SELECT * FROM books ${searchQuery} ${sortQuery}`;
        const result = await db.query(query, searchValues);
        const books = result.rows;

        // For each book, fetch the cover image or use a default one if not available
        const updatedBooks = await Promise.all(books.map(async (book) => {
            if (book.cover_identifier) {
                try {
                    const coverUrl = `http://covers.openlibrary.org/b/isbn/${book.cover_identifier}-L.jpg`;

                    await axios.get(coverUrl); // Check if the image exists
                    book.cover_url = coverUrl;
                } catch (error) {
                    console.error(`Error fetching cover image for ISBN ${book.cover_identifier}:`, error.message);
                    book.cover_url = 'https://www.press.uillinois.edu/books/images/no_cover.jpg'; // Fallback image
                }
            } else {
                book.cover_url = 'https://www.press.uillinois.edu/books/images/no_cover.jpg'; // Default image
            }
            return book;
        }));

        const noResults = updatedBooks.length === 0; // Flag for handling no results

        // Render the index page with the list of books
        res.render("index.ejs", { books: updatedBooks, isIndexPage: true, noResults, search });
    } catch (err) {
        console.error('Database query failed:', err.message);
        next(err); // Error handling middleware
    }
});

// GET route to render the form for adding a new book
app.get("/books/add", (req, res, next) => {
    res.render("addBook.ejs", { isIndexPage: false });
});

// POST route for adding a new book, with form validation
app.post("/books", bookValidationRules, async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).render('error.ejs', { errors: errors.array(), isIndexPage: false });
    }
    const { title, author, rating, isbn, notes } = req.body;

    try {
        // Insert a new book into the database
        const insertQuery = 
        `INSERT INTO books (title, author, rating, cover_identifier, notes) VALUES ($1, $2, $3, $4, $5)`;
        await db.query(insertQuery, [title, author, rating, isbn, notes]);

        res.redirect("/");
    } catch (err) {
        // Handle specific database constraint errors
        if (err.message.includes("violates check constraint")) {
            return res.status(400).render('error.ejs', { 
                errors: [{ msg: "Rating must be between 1 and 5." }], 
                isIndexPage: false 
            });
        } else if (err.message.includes("invalid input syntax for type integer")) {
            return res.status(400).render('error.ejs', { 
                errors: [{ msg: "Rating must be a valid number." }], 
                isIndexPage: false 
            });
        }

        // General error handler
        console.error('Failed to add the book', err.message);
        next(err);
    }
});

// GET route to render the form for editing an existing book
app.get("/books/edit/:id", async (req, res) => {
    const bookId = req.params.id; // Get the book ID from the URL

    try {
        // Fetch the book details by ID from the database
        const result = await db.query("SELECT * FROM books WHERE id = $1", [bookId]);
        const book = result.rows[0];

        // Render the edit page with the book details
        res.render("editBook.ejs", { book, isIndexPage: false });
    } catch (err) {
        console.error(err);
        next(err);
    }
})

// POST route to update an existing book
app.post("/books/edit/:id", bookValidationRules, async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).render('error.ejs', { errors: errors.array(), isIndexPage: false });
    }

    const bookId = req.params.id;
    const { title, author, rating, isbn, notes } = req.body;

    try {
        // Update the book record in the database
        const updateQuery = 
        `UPDATE books SET title = $1, author = $2, rating = $3, cover_identifier = $4, notes = $5 WHERE id = $6`;
        await db.query(updateQuery, [title, author, rating, isbn, notes, bookId]);

        res.redirect("/");
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// POST route to delete a book from the database
app.post("/books/delete/:id", async (req, res, next) => {
    const bookId = req.params.id;

    try {
        // Delete the book record by ID
        const deleteQuery = "DELETE FROM books WHERE id = $1";
        await db.query(deleteQuery, [bookId]);

        res.redirect("/");
    } catch (err) {
        console.error(err);
        next(err);
    }
});

// Global error handling middleware for unexpected errors
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error.ejs', {errors: [{ msg: err.message }], isIndexPage: false });
});

// Server starts listening on the specified port
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});