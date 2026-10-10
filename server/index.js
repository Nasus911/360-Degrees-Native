require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function readTable(tableName) {
  const { data, error } = await supabase.from(tableName).select('*');

  if (error) {
    throw error;
  }

  return data;
}


app.get('/api/message', async (req, res) => {
  try {
    const data = await readTable('todos');

    res.json({ message: `Database Connected! Found ${data.length} items.` });
  } catch (err) {
    console.error("Database connection failure:", err.message);
    res.status(500).json({ error: "Failed to connect to Supabase" });
  }
});

app.get('/api/menu', async (req, res) => {
  try {
    res.json(await readTable('menu_items'));
  } catch (err) {
    console.error("Menu lookup failure:", err.message);
    res.status(500).json({ error: "Failed to load menu items" });
  }
});

app.get('/api/inventory', async (req, res) => {
  try {
    res.json(await readTable('inventory'));
  } catch (err) {
    console.error("Inventory lookup failure:", err.message);
    res.status(500).json({ error: "Failed to load inventory" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running smoothly on http://localhost:${PORT}`);
});
