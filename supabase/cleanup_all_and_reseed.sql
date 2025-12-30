-- Complete cleanup: Delete all shows and reseed with search URLs only
-- Use this if you want a clean slate

-- IMPORTANT: Delete in order to respect foreign key constraints
-- First, delete all game-related data that references shows
DELETE FROM attempts;
DELETE FROM timelines;
DELETE FROM game_state;
DELETE FROM players;
DELETE FROM lobbies;

-- Now safe to delete all shows
DELETE FROM shows;

-- Reseed with search URLs only
INSERT INTO shows (show_name, network, artist, premiere_year, youtube_url) VALUES
('Friends', 'NBC', 'The Rembrandts', 1994, 'https://www.youtube.com/results?search_query=friends+tv+show+opening+theme'),
('The Simpsons', 'Fox', 'Danny Elfman', 1989, 'https://www.youtube.com/results?search_query=the+simpsons+opening+theme'),
('Game of Thrones', 'HBO', 'Ramin Djawadi', 2011, 'https://www.youtube.com/results?search_query=game+of+thrones+opening+theme'),
('The Office', 'NBC', 'The Scrantones', 2005, 'https://www.youtube.com/results?search_query=the+office+us+opening+theme'),
('Breaking Bad', 'AMC', 'Dave Porter', 2008, 'https://www.youtube.com/results?search_query=breaking+bad+opening+theme'),
('Stranger Things', 'Netflix', 'Kyle Dixon & Michael Stein', 2016, 'https://www.youtube.com/results?search_query=stranger+things+opening+theme'),
('The Fresh Prince of Bel-Air', 'NBC', 'DJ Jazzy Jeff & The Fresh Prince', 1990, 'https://www.youtube.com/results?search_query=fresh+prince+of+bel+air+opening+theme'),
('The X-Files', 'Fox', 'Mark Snow', 1993, 'https://www.youtube.com/results?search_query=the+x+files+opening+theme'),
('Twin Peaks', 'ABC', 'Angelo Badalamenti', 1990, 'https://www.youtube.com/results?search_query=twin+peaks+opening+theme'),
('The Sopranos', 'HBO', 'Alabama 3', 1999, 'https://www.youtube.com/results?search_query=the+sopranos+opening+theme'),
('Cheers', 'NBC', 'Gary Portnoy', 1982, 'https://www.youtube.com/results?search_query=cheers+tv+show+opening+theme'),
('The West Wing', 'NBC', 'W.G. Snuffy Walden', 1999, 'https://www.youtube.com/results?search_query=the+west+wing+opening+theme'),
('Lost', 'ABC', 'Michael Giacchino', 2004, 'https://www.youtube.com/results?search_query=lost+tv+show+opening+theme'),
('Mad Men', 'AMC', 'RJD2', 2007, 'https://www.youtube.com/results?search_query=mad+men+opening+theme'),
('The Crown', 'Netflix', 'Hans Zimmer', 2016, 'https://www.youtube.com/results?search_query=the+crown+opening+theme'),
('Seinfeld', 'NBC', 'Jonathan Wolff', 1989, 'https://www.youtube.com/results?search_query=seinfeld+opening+theme'),
('The Wire', 'HBO', 'Tom Waits', 2002, 'https://www.youtube.com/results?search_query=the+wire+opening+theme'),
('Dexter', 'Showtime', 'Rolfe Kent', 2006, 'https://www.youtube.com/results?search_query=dexter+opening+theme'),
('House of Cards', 'Netflix', 'Jeff Beal', 2013, 'https://www.youtube.com/results?search_query=house+of+cards+opening+theme'),
('True Detective', 'HBO', 'T Bone Burnett', 2014, 'https://www.youtube.com/results?search_query=true+detective+opening+theme'),
('Fargo', 'FX', 'Jeff Russo', 2014, 'https://www.youtube.com/results?search_query=fargo+tv+show+opening+theme'),
('Better Call Saul', 'AMC', 'Little Barrie', 2015, 'https://www.youtube.com/results?search_query=better+call+saul+opening+theme'),
('The Handmaid''s Tale', 'Hulu', 'Adam Taylor', 2017, 'https://www.youtube.com/results?search_query=the+handmaids+tale+opening+theme'),
('Succession', 'HBO', 'Nicholas Britell', 2018, 'https://www.youtube.com/results?search_query=succession+hbo+opening+theme');

