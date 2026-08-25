import sqlite3

db = sqlite3.connect("./data/scorekeeper.db")

rows = db.execute(
    "SELECT id, scoreboard_id, name, joined_at "
    "FROM players"
).fetchall()

print("Players:")
for row in rows:
    print(row)

db.close()