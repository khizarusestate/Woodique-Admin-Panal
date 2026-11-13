import { useCallback, useEffect, useMemo, useState } from "react";
import { PanelsTopLeft, Users, Search, LogOut, ShieldCheck, Trash2, Edit3, X, Package, LayoutDashboard, ShoppingBag, Tags, Settings, Plus, Menu, Eye, Save, RefreshCw, Archive, RotateCcw } from "lucide-react";

const API = "/api/admin";
const PAGE_SIZE = 10;
const ORDER_STATUSES = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"];
const formatPKR = value => "PKR " + Number(value || 0).toLocaleString("en-PK");
const dateLabel = value => value ? new Date(value).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "OVERVIEW" },
  { id: "customers", label: "Customers", icon: Users, group: "MANAGEMENT" },
  { id: "products", label: "Tray Sets", icon: PanelsTopLeft, group: "MANAGEMENT" },
  { id: "orders", label: "Orders", icon: ShoppingBag, group: "MANAGEMENT" },
  { id: "categories", label: "Collections", icon: Tags, group: "MANAGEMENT" },
  { id: "settings", label: "Settings", icon: Settings, group: "SYSTEM" }
];

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    credentials: "include",
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error(data.message || "Your session has expired. Please sign in again.");
    throw new Error(data.message || "Request failed. Please try again.");
  }
  return data;
}

function normalizeOrder(order) {
  const snapshot = order.customerSnapshot || {};
  return {
    ...order,
    id: order._id,
    customer: snapshot.name || "Customer",
    email: snapshot.email || "",
    phone: snapshot.phone || "",
    address: [snapshot.address, snapshot.city, snapshot.country].filter(Boolean).join(", "),
    date: order.createdAt,
    items: (order.items || []).map(item => ({ ...item, price: Number(item.unitPrice || 0), quantity: Number(item.quantity || 0), lineTotal: Number(item.lineTotal || 0) })),
    total: Number(order.total || 0)
  };
}

function App() {
  const [admin, setAdmin] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [active, setActive] = useState("dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [unreadOrders, setUnreadOrders] = useState(0);
  const [unreadCustomers, setUnreadCustomers] = useState(0);
  const [search, setSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalResults, setGlobalResults] = useState({ customers: [], products: [], orders: [], categories: [] });
  const [categorySearch, setCategorySearch] = useState("");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [editCustomer, setEditCustomer] = useState(null);
  const [productForm, setProductForm] = useState(null);
  const [editingProduct, setEditingProduct] = useState(false);
  const [categoryForm, setCategoryForm] = useState("");
  const [viewOrder, setViewOrder] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const flash = message => { setNotice(message); window.setTimeout(() => setNotice(""), 4500); };

  const loadData = useCallback(async () => {
    setLoadError("");
    try {
      const [customerData, productData, orderData] = await Promise.all([
        api("/customers?limit=100"),
        api("/products"),
        api("/orders?limit=100")
      ]);
      const nextCustomers = customerData.customers || [];
      const nextOrders = (orderData.orders || []).map(normalizeOrder);
      setCustomers(nextCustomers);
      setProducts(productData.products || []);
      setOrders(nextOrders);

      const updateUnread = (key, records) => {
        const storageKey = `woodique-admin-last-viewed-${key}`;
        const stored = localStorage.getItem(storageKey);
        const latest = records.reduce((max, item) => {
          const stamp = new Date(item.createdAt || item.date || 0).getTime();
          return Number.isFinite(stamp) ? Math.max(max, stamp) : max;
        }, 0);
        if (stored === null) {
          localStorage.setItem(storageKey, String(Date.now()));
          return 0;
        }
        const lastViewed = Number(stored) || 0;
        return records.filter(item => {
          const stamp = new Date(item.createdAt || item.date || 0).getTime();
          return Number.isFinite(stamp) && stamp > lastViewed;
        }).length;
      };
      setUnreadOrders(updateUnread("orders", nextOrders));
      setUnreadCustomers(updateUnread("customers", nextCustomers));
    } catch (err) {
      setLoadError(err.message);
      if (/session|sign in|unauthorized/i.test(err.message)) setAdmin(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api("/me")
      .then(data => { if (alive) setAdmin(data.user); })
      .catch(() => { if (alive) setAdmin(null); })
      .finally(() => { if (alive) setBooting(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!admin) return;
    loadData();
    const poll = window.setInterval(loadData, 30000);
    return () => window.clearInterval(poll);
  }, [admin, loadData]);

  const login = async event => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setAdmin(data.user);
      setPassword("");
      setActive("dashboard");
      flash("Signed in successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const signout = async () => {
    try { await api("/logout", { method: "POST" }); } catch { /* local sign-out still proceeds */ }
    setAdmin(null);
    setEmail("");
    setPassword("");
    setSearch("");
    setActive("dashboard");
    setMobileMenu(false);
  };

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter(c => !term || [c.name, c.email, c.phone, c.city].some(v => String(v || "").toLowerCase().includes(term)));
  }, [customers, search]);
  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter(o => !term || [o.orderNumber, o.id, o.customer, o.email, o.phone, o.status].some(v => String(v || "").toLowerCase().includes(term)));
  }, [orders, search]);
  const visibleProducts = useMemo(() => products.filter(p => showArchived || p.active !== false), [products, showArchived]);
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return visibleProducts.filter(p => !term || [p.name, p.category, p.description].some(v => String(v || "").toLowerCase().includes(term)));
  }, [visibleProducts, search]);
  const categories = useMemo(() => [...new Set(products.filter(p => p.active !== false).map(p => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [products]);
  const filteredCategories = useMemo(() => { const term = categorySearch.trim().toLowerCase(); return categories.filter(category => !term || category.toLowerCase().includes(term)); }, [categories, categorySearch]);
  useEffect(() => {
    const term = globalSearch.trim();
    if (term.length < 2) {
      setGlobalResults({ customers: [], products: [], orders: [], categories: [] });
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api("/search?q=" + encodeURIComponent(term))
        .then(data => { if (!cancelled) setGlobalResults(data.results || { customers: [], products: [], orders: [], categories: [] }); })
        .catch(() => { if (!cancelled) setGlobalResults({ customers: [], products: [], orders: [], categories: [] }); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [globalSearch]);
  const pages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const visibleCustomers = filteredCustomers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, active]);

  const changePage = id => {
    const markLatestViewed = (key, records) => {
      const latest = records.reduce((max, item) => {
        const stamp = new Date(item.createdAt || item.date || 0).getTime();
        return Number.isFinite(stamp) ? Math.max(max, stamp) : max;
      }, Number(localStorage.getItem(`woodique-admin-last-viewed-${key}`)) || 0);
      localStorage.setItem(`woodique-admin-last-viewed-${key}`, String(latest));
    };
    if (id === "orders") {
      markLatestViewed("orders", orders);
      setUnreadOrders(0);
    }
    if (id === "customers") {
      markLatestViewed("customers", customers);
      setUnreadCustomers(0);
    }
    setActive(id);
    setSearch("");
    setMobileMenu(false);
  };

  const saveCustomer = async event => {
    event.preventDefault();
    try {
      const payload = Object.fromEntries(["name", "phone", "address", "city", "country"].map(key => [key, editCustomer[key] || ""]));
      const data = await api("/customers/" + encodeURIComponent(editCustomer.id), { method: "PATCH", body: JSON.stringify(payload) });
      setCustomers(prev => prev.map(c => c.id === editCustomer.id ? data.customer : c));
      setEditCustomer(null);
      flash("Customer details updated.");
    } catch (err) { flash(err.message); }
  };

  const deleteCustomer = async id => {
    if (!window.confirm("Permanently delete this customer account? Existing orders will remain in order history.")) return;
    try {
      await api("/customers/" + encodeURIComponent(id), { method: "DELETE" });
      setCustomers(prev => prev.filter(c => c.id !== id));
      flash("Customer account deleted.");
    } catch (err) { flash(err.message); }
  };

  const handleProductImages = event => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    if (files.length > 4) { flash("Choose up to 4 product images."); event.target.value = ""; return; }
    const invalid = files.find(file => !file.type.startsWith("image/") || file.size > 8 * 1024 * 1024);
    if (invalid) { flash("Choose image files smaller than 8 MB each."); event.target.value = ""; return; }
    Promise.all(files.map(file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read an image."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("An image could not be processed."));
        image.onload = () => {
          const scale = Math.min(1, 1500 / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          let quality = 0.82, result = canvas.toDataURL("image/jpeg", quality);
          while (result.length > 1300000 && quality > 0.45) { quality -= 0.08; result = canvas.toDataURL("image/jpeg", quality); }
          if (result.length > 1400000) reject(new Error("An image is too large after compression."));
          else resolve(result);
        };
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    }))).then(images => setProductForm(prev => ({ ...prev, image: images[0], images }))).catch(error => flash(error.message));
  };

  const openNewProduct = () => {
    setEditingProduct(false);
    setProductForm({ name: "", category: categories[0] || "", price: "", image: "", images: [], tag: "", description: "", material: "", care: "" });
  };

  const saveProduct = async event => {
    event.preventDefault();
    if (!productForm.category.trim()) { flash("Enter a category name first."); return; }
    const payload = { ...productForm, image: productForm.image || productForm.images?.[0] || "", images: productForm.images?.length ? productForm.images : (productForm.image ? [productForm.image] : []), price: Number(productForm.price), active: true };
    try {
      const data = await api(editingProduct ? "/products/" + encodeURIComponent(productForm.id) : "/products", {
        method: editingProduct ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      const saved = data.product;
      setProducts(prev => editingProduct ? prev.map(p => p.id === saved.id ? saved : p) : [saved, ...prev]);
      setProductForm(null);
      setEditingProduct(false);
      flash(editingProduct ? "Product updated." : "Product added to the live catalogue.");
    } catch (err) { flash(err.message); }
  };

  const archiveProduct = async product => {
    const restoring = product.active === false;
    if (!restoring && !window.confirm("Archive this product? It will disappear from the storefront but remain in admin records.")) return;
    try {
      const data = await api("/products/" + encodeURIComponent(product.id), {
        method: "PATCH",
        body: JSON.stringify({ active: restoring })
      });
      setProducts(prev => prev.map(p => p.id === product.id ? data.product : p));
      flash(restoring ? "Product restored to storefront." : "Product archived.");
    } catch (err) { flash(err.message); }
  };

  const updateOrderStatus = async (id, status) => {
    const previous = orders.find(order => order.id === id);
    try {
      const data = await api("/orders/" + encodeURIComponent(id) + "/status", { method: "PATCH", body: JSON.stringify({ status }) });
      const updated = normalizeOrder(data.order);
      setOrders(prev => prev.map(order => order.id === id ? updated : order));
      setViewOrder(prev => prev?.id === id ? updated : prev);
      flash("Order status updated.");
    } catch (err) {
      if (previous) flash(err.message);
    }
  };

  const renameCategory = async category => {
    const next = window.prompt("New collection name", category)?.trim();
    if (!next || next === category) return;
    if (categories.some(item => item.toLowerCase() === next.toLowerCase())) { flash("That category already exists."); return; }
    const affected = products.filter(p => p.active !== false && p.category === category);
    try {
      const updated = await Promise.all(affected.map(p => api("/products/" + encodeURIComponent(p.id), { method: "PATCH", body: JSON.stringify({ category: next }) })));
      const byId = new Map(updated.map(result => [result.product.id, result.product]));
      setProducts(prev => prev.map(p => byId.get(p.id) || p));
      flash("Category renamed across " + affected.length + " products.");
    } catch (err) {
      await loadData();
      flash("Some category updates may have failed: " + err.message + ". Data refreshed; check the category list.");
    }
  };

  if (booting) return <main className="login-shell"><div className="login-card"><p className="eyebrow">WOODIQUE</p><h1>Checking secure session…</h1><p className="muted">Please wait.</p></div></main>;

  if (!admin) return <main className="login-shell"><form className="login-card" onSubmit={login}><img src="/images/Logo.png" alt="Woodique logo" className="login-logo"/><p className="eyebrow">WOODIQUE • PRIVATE ACCESS</p><h1>Admin sign in</h1><p className="muted">Sign in to manage the store.</p>{error && <div className="alert">{error}</div>}<label>Email address<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label><button className="gold-btn" type="submit" disabled={busy}>{busy ? "Signing in…" : "Login"}</button></form></main>;

  const current = NAV.find(n => n.id === active) || NAV[0];
  const PageIcon = current.icon;

  return <main className="app-shell">
    <aside className={"sidebar " + (mobileMenu ? "sidebar-open" : "")}>
      <div className="brand"><img src="/images/Logo.png" alt="Woodique logo" className="nav-logo"/><button className="mobile-close" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={19}/></button></div>
      <div className="menu-caption">WORKSPACE</div>
      {["OVERVIEW", "MANAGEMENT", "SYSTEM"].map(group => <div className="nav-group" key={group}><p className="nav-group-title">{group}</p>{NAV.filter(n => n.group === group).map(n => { const Icon = n.icon; return <button key={n.id} className={"nav-item " + (active === n.id ? "nav-item-active" : "")} onClick={() => changePage(n.id)}><Icon size={17}/><span>{n.label}</span>{n.id === "products" && <small>{products.filter(p => p.active !== false).length}</small>}{n.id === "orders" && unreadOrders > 0 && <small className="nav-badge" aria-label={`${unreadOrders} new orders`}>{unreadOrders > 9 ? "9+" : unreadOrders}</small>}{n.id === "customers" && unreadCustomers > 0 && <small className="nav-badge" aria-label={`${unreadCustomers} new customers`}>{unreadCustomers > 9 ? "9+" : unreadCustomers}</small>}</button>; })}</div>)}
      <div className="sidebar-bottom"><div className="admin-profile"><div className="avatar">A</div><div className="admin-meta"><b>{admin.name || "Administrator"}</b><small>{admin.email}</small></div><button className="signout-menu" title="Sign out" onClick={signout}><LogOut size={17}/></button></div></div>
    </aside>
    {mobileMenu && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)}/>}
    <section className="workspace">
      <header className="topbar"><div className="heading-wrap"><button className="menu-toggle" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={21}/></button><div><p className="eyebrow">WOODIQUE / {current.label.toUpperCase()}</p><h1>{active === "dashboard" ? "Dashboard overview" : current.label}</h1></div></div><div className="topbar-actions"><button className="ghost-btn compact-btn" onClick={loadData} title="Refresh data"><RefreshCw size={15}/> Refresh</button>{active === "products" && <button className="gold-btn compact-btn" onClick={openNewProduct}><Plus size={16}/> Add product</button>}</div></header>
      {notice && <div className="success">{notice}<button onClick={() => setNotice("")}><X size={15}/></button></div>}
      {loadError && <div className="alert">{loadError}<button onClick={loadData}><RefreshCw size={15}/> Retry</button></div>}
      {active === "dashboard" && <>
        <div className="welcome-row"><div><h2>Welcome back, {admin.name || "Administrator"}</h2><p className="muted">Live overview from your store database.</p></div><button className="ghost-btn" onClick={() => changePage("products")}><Package size={16}/> Manage tray sets</button></div>
        <div className="global-search-panel"><div className="global-search-heading"><div><h2>Search your store</h2><p className="muted">Find customers, tray sets, orders and collections from one place.</p></div></div><div className="search global-search"><Search size={18}/><input value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} placeholder="Search anything… name, order number, product, phone" aria-label="Search all store records"/>{globalSearch && <button type="button" className="global-search-clear" onClick={() => setGlobalSearch("")} aria-label="Clear global search"><X size={15}/></button>}</div>{globalSearch.trim() && <div className="global-results">{[
          { key: "customers", label: "Customers", items: globalResults.customers, detail: item => `${item.email || "No email"} · ${item.phone || "No phone"}`, open: item => { changePage("customers"); setSearch(item.email || item.name || ""); } },
          { key: "products", label: "Tray Sets", items: globalResults.products, detail: item => `${item.category || "Uncategorised"} · ${formatPKR(item.price)}`, open: item => { changePage("products"); setSearch(item.name || ""); } },
          { key: "orders", label: "Orders", items: globalResults.orders, detail: item => `${item.customer} · ${item.status} · ${formatPKR(item.total)}`, open: item => { changePage("orders"); setSearch(item.orderNumber || item.id || ""); } },
          { key: "categories", label: "Collections", items: globalResults.categories, detail: () => "Collection", open: item => { changePage("categories"); setCategorySearch(item); } }
        ].map(group => group.items.length > 0 && <div className="global-result-group" key={group.key}><div className="global-result-label"><b>{group.label}</b><small>{group.items.length} result(s)</small></div>{group.items.map((item, index) => <button className="global-result-item" key={item.id || item._id || item || index} onClick={() => group.open(item)}><span><b>{item.name || item.orderNumber || item}</b><small>{group.detail(item)}</small></span><em>Open {group.label} ↗</em></button>)}</div>)}{!globalResults.customers.length && !globalResults.products.length && !globalResults.orders.length && !globalResults.categories.length && <p className="global-no-results">No matching records found in the latest loaded data.</p>}</div>}</div>
        <div className="stats">
          <article><Users/><span>Total customers</span><strong>{customers.length}</strong><small className="stat-foot">Latest 100 loaded</small></article>
          <article><PanelsTopLeft/><span>Active products</span><strong>{products.filter(p => p.active !== false).length}</strong><small className="stat-foot">Live tray set collection</small></article>
          <article><ShoppingBag/><span>Orders</span><strong>{orders.length}</strong><small className="stat-foot">{orders.filter(o => o.status === "Pending").length} pending · latest 100</small></article>
          <article><Package/><span>Order value</span><strong>{formatPKR(orders.reduce((sum, o) => sum + (o.status === "Cancelled" ? 0 : o.total), 0))}</strong><small className="stat-foot">Loaded orders, excluding cancelled</small></article>
        </div>
        <div className="section-title"><div><h2>Quick access</h2><p className="muted">Manage your live store data.</p></div></div>
        <div className="quick-grid">{NAV.filter(n => n.id !== "dashboard").map(n => { const Icon = n.icon; return <button key={n.id} className="quick-card" onClick={() => changePage(n.id)}><span className="quick-icon"><Icon size={21}/></span><span><b>{n.label}</b><small>{({ customers: "View customer accounts", products: "Manage tray sets", orders: "Review and update orders", categories: "Organize product categories", settings: "Access and security" })[n.id]}</small></span><span className="quick-arrow">↗</span></button>; })}</div>
      </>}
      {active === "customers" && <div className="table-card"><div className="table-head"><div><h2>Customer accounts</h2><p className="muted">Latest 100 customer accounts from MongoDB.</p></div><div className="search"><Search size={17}/><input placeholder="Search name, email or city…" value={search} onChange={e => setSearch(e.target.value)}/></div></div><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Contact</th><th>Joined</th><th>Actions</th></tr></thead><tbody>{visibleCustomers.map(c => <tr key={c.id}><td><b>{c.name}</b><small>{c.email}</small></td><td>{c.phone || "—"}</td><td>{dateLabel(c.createdAt)}</td><td><button className="icon-btn" title="Edit customer" onClick={() => setEditCustomer({ ...c })}><Edit3 size={16}/></button><button className="icon-btn danger" title="Delete customer" onClick={() => deleteCustomer(c.id)}><Trash2 size={16}/></button></td></tr>)}{!visibleCustomers.length && <tr><td colSpan="4" className="empty">{customers.length ? "No customers match your search." : "No customer records available."}</td></tr>}</tbody></table></div><footer className="pagination"><span>{filteredCustomers.length} records · Page {page} of {pages}</span><div><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button></div></footer></div>}
      {active === "products" && <div className="table-card"><div className="table-head"><div><h2>Tray set catalogue</h2><p className="muted">Changes are saved directly to the live storefront catalogue.</p></div><div className="search"><Search size={17}/><input placeholder="Search products or categories…" value={search} onChange={e => setSearch(e.target.value)}/></div></div><div className="order-filters"><button className={"filter-chip " + (!showArchived ? "filter-chip-active" : "")} onClick={() => setShowArchived(false)}>Active</button><button className={"filter-chip " + (showArchived ? "filter-chip-active" : "")} onClick={() => setShowArchived(true)}>Include archived</button></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price (PKR)</th><th>Tag</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredProducts.map(p => <tr key={p.id}><td><div className="product-cell">{p.image ? <img src={p.image} alt="" className="product-thumb"/> : <div className="product-thumb product-thumb-empty"><PanelsTopLeft size={16}/></div>}<span><b>{p.name}</b><small>{p.description || "No description"}</small></span></div></td><td>{p.category}</td><td>{Number(p.price || 0).toLocaleString("en-PK")}</td><td>{p.tag || "—"}</td><td><span className="stock-pill">{p.active === false ? "Archived" : "Active"}</span></td><td><button className="icon-btn" title="Edit product" onClick={() => { setProductForm({ ...p, price: String(p.price) }); setEditingProduct(true); }}><Edit3 size={16}/></button><button className="icon-btn danger" title={p.active === false ? "Restore product" : "Archive product"} onClick={() => archiveProduct(p)}>{p.active === false ? <RotateCcw size={16}/> : <Archive size={16}/>}</button></td></tr>)}{!filteredProducts.length && <tr><td colSpan="6" className="empty">No products in this view.</td></tr>}</tbody></table></div><footer className="pagination"><span>{filteredProducts.length} products shown · {products.length} total records</span><button className="gold-btn compact-btn" onClick={openNewProduct}><Plus size={15}/> Add product</button></footer></div>}
      {active === "orders" && <div className="table-card"><div className="table-head"><div><h2>Orders workspace</h2><p className="muted">Latest 100 customer orders from MongoDB.</p></div><div className="search"><Search size={17}/><input placeholder="Search order, customer or status…" value={search} onChange={e => setSearch(e.target.value)}/></div></div><div className="order-filters">{["All", ...ORDER_STATUSES].map(status => <button key={status} className={"filter-chip " + ((search === status) ? "filter-chip-active" : "")} onClick={() => setSearch(status === "All" ? "" : status)}>{status}{status !== "All" && <small>{orders.filter(o => o.status === status).length}</small>}</button>)}</div><div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredOrders.map(o => <tr key={o.id}><td><div className="order-product-cell">{o.items[0]?.image ? <img src={o.items[0].image} alt={o.items[0].name || "Ordered product"} className="order-product-thumb"/> : <div className="order-product-thumb order-product-thumb-empty"><Package size={16}/></div>}<span><b>{o.orderNumber}</b><small>{o.items.reduce((n, i) => n + i.quantity, 0)} item(s)</small></span></div></td><td><b>{o.customer}</b><small>{o.email}</small></td><td>{dateLabel(o.date)}</td><td>{formatPKR(o.total)}</td><td><select className={"status-select status-" + o.status.toLowerCase()} value={o.status} onChange={e => updateOrderStatus(o.id, e.target.value)} aria-label={"Update status for " + o.orderNumber}>{ORDER_STATUSES.map(st => <option key={st}>{st}</option>)}</select></td><td><button className="icon-btn" title="View order details" onClick={() => setViewOrder({ ...o })}><Eye size={16}/></button></td></tr>)}{!filteredOrders.length && <tr><td colSpan="6" className="empty">No orders match this search or filter.</td></tr>}</tbody></table></div><footer className="pagination"><span>{filteredOrders.length} orders shown · latest 100 loaded</span></footer></div>}
      {active === "categories" && <div className="table-card"><div className="table-head"><div><h2>Tray set collections</h2><p className="muted">Categories are derived from active products in the live catalogue.</p></div><div className="search"><Search size={17}/><input placeholder="Search collections…" value={categorySearch} onChange={e => setCategorySearch(e.target.value)}/></div></div><form className="category-add" onSubmit={event => { event.preventDefault(); const value = categoryForm.trim(); if (!value) return; if (categories.some(c => c.toLowerCase() === value.toLowerCase())) { flash("That category already exists."); return; } openNewProduct(); setProductForm(prev => ({ ...prev, category: value })); setCategoryForm(""); flash("Category added to the new-product form. Save a product to publish it."); }}><input value={categoryForm} onChange={e => setCategoryForm(e.target.value)} placeholder="New collection name" required/><button className="gold-btn compact-btn" type="submit"><Plus size={15}/> Use category</button></form><div className="category-list">{!categories.length && <p className="empty">No active product categories yet. Add a product to create the first category.</p>}{filteredCategories.map(category => <div className="category-row" key={category}><span className="category-symbol"><Tags size={17}/></span><b>{category}</b><span className="category-count">{products.filter(p => p.active !== false && p.category === category).length} products</span><button className="icon-btn" title={"Rename " + category} onClick={() => renameCategory(category)}><Edit3 size={16}/></button></div>)}</div></div>}
      {active === "settings" && <><div className="section-search-wrap"><div className="search"><Search size={17}/><input placeholder="Search settings and configuration…" value={settingsSearch} onChange={e => setSettingsSearch(e.target.value)}/></div></div><div className="settings-grid">{(!settingsSearch.trim() || "store configuration api connection authentication server session cookie product image handling customer data orders database".includes(settingsSearch.trim().toLowerCase())) && <div className="table-card settings-card"><p className="eyebrow">STORE CONFIGURATION</p><h2>API connection</h2><p className="muted">This dashboard uses the same-origin API proxy and secure HTTP-only admin session.</p><div className="settings-info"><ShieldCheck size={18}/><span><b>Server-side authentication</b><small>Admin role is checked by the backend on every protected request. Session cookie is not readable by JavaScript.</small></span></div><div className="settings-info"><Package size={18}/><span><b>Product image handling</b><small>Images are resized and compressed in the browser before being stored with the product record.</small></span></div><div className="settings-info"><Users size={18}/><span><b>Customer data</b><small>Customer email is read-only here. Name, phone and delivery details can be updated.</small></span></div><div className="settings-info"><ShoppingBag size={18}/><span><b>Orders</b><small>Order totals and item prices are read from the database; only status is editable.</small></span></div></div>}{(!settingsSearch.trim() || "admin session account sign out administrator email".includes(settingsSearch.trim().toLowerCase())) && <div className="table-card settings-card"><p className="eyebrow">ADMIN SESSION</p><h2>Account</h2><p className="muted">{admin.name || "Administrator"}</p><p className="muted">{admin.email}</p><button className="ghost-btn" onClick={signout}><LogOut size={16}/> Sign out</button></div>}{settingsSearch.trim() && !("store configuration api connection authentication server session cookie product image handling customer data orders database".includes(settingsSearch.trim().toLowerCase()) || "admin session account sign out administrator email".includes(settingsSearch.trim().toLowerCase())) && <p className="empty">No settings match your search.</p>}</div></> }
      <p className="muted signed">Signed in as {admin.email}</p>
    </section>
    {editCustomer && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditCustomer(null); }}><form className="edit-modal" onSubmit={saveCustomer}><button type="button" className="close" onClick={() => setEditCustomer(null)}><X/></button><p className="eyebrow">CUSTOMER PROFILE</p><h2>Edit customer</h2><label>Name<input required minLength="2" maxLength="70" value={editCustomer.name || ""} onChange={e => setEditCustomer({ ...editCustomer, name: e.target.value })}/></label><label>Email (read only)<input disabled value={editCustomer.email || ""}/></label>{["phone", "address", "city", "country"].map(key => <label key={key}>{key[0].toUpperCase() + key.slice(1)}<input value={editCustomer[key] || ""} onChange={e => setEditCustomer({ ...editCustomer, [key]: e.target.value })}/></label>)}<div className="modal-actions"><button type="button" className="ghost-btn" onClick={() => setEditCustomer(null)}>Cancel</button><button className="gold-btn" type="submit"><Save size={15}/> Save changes</button></div></form></div>}
    {viewOrder && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setViewOrder(null); }}><section className="edit-modal order-modal"><button type="button" className="close" onClick={() => setViewOrder(null)}><X/></button><p className="eyebrow">ORDER DETAILS · {viewOrder.orderNumber}</p><h2>{viewOrder.customer}</h2><p className="muted">{new Date(viewOrder.date).toLocaleString()}</p><div className="order-detail-grid"><div><small>Email</small><b>{viewOrder.email}</b></div><div><small>Phone</small><b>{viewOrder.phone || "Not provided"}</b></div><div><small>Delivery address</small><b>{viewOrder.address || "Not provided"}</b></div><div><small>Customer note</small><b>{viewOrder.customerNote || "—"}</b></div></div><h3 className="order-items-title">Items</h3><div className="order-items">{viewOrder.items.map((item, i) => <div className="order-item-row" key={i}>{item.image ? <img src={item.image} alt={item.name || "Ordered product"} className="order-item-image"/> : <div className="order-item-image order-product-thumb-empty"><Package size={16}/></div>}<span className="order-item-name">{item.name} × {item.quantity}</span><b>{formatPKR(item.lineTotal || item.price * item.quantity)}</b></div>)}</div><div className="order-total"><span>Order total</span><b>{formatPKR(viewOrder.total)}</b></div><label>Order status<select value={viewOrder.status} onChange={e => updateOrderStatus(viewOrder.id, e.target.value)}>{ORDER_STATUSES.map(st => <option key={st}>{st}</option>)}</select></label><div className="modal-actions"><button className="ghost-btn" onClick={() => setViewOrder(null)}>Close details</button></div></section></div>}
    {productForm && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) { setProductForm(null); setEditingProduct(false); } }}><form className="edit-modal product-modal" onSubmit={saveProduct}><button type="button" className="close" onClick={() => { setProductForm(null); setEditingProduct(false); }}><X/></button><p className="eyebrow">CATALOGUE MANAGEMENT</p><h2>{editingProduct ? "Edit product" : "Add new product"}</h2><p className="muted">Saved products appear on the storefront catalogue.</p><label>Tray set name *<input required maxLength="140" value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} placeholder="e.g. Walnut Serving Tray Set"/></label><label>Category *<input required maxLength="60" list="product-categories" value={productForm.category} onChange={e => setProductForm({ ...productForm, category: e.target.value })} placeholder="e.g. Serving Trays"/><datalist id="product-categories">{categories.map(c => <option key={c} value={c}/>)}</datalist></label><div className="form-two"><label>Price (PKR) *<input required type="number" min="0" step="0.01" value={productForm.price} onChange={e => setProductForm({ ...productForm, price: e.target.value })} placeholder="18500"/></label><label>Product tag<input maxLength="40" value={productForm.tag || ""} onChange={e => setProductForm({ ...productForm, tag: e.target.value })} placeholder="e.g. Best seller"/></label></div><label>Product gallery images *<input type="file" accept="image/*" multiple onChange={handleProductImages}/><small className="field-help">Choose up to 4 JPG, PNG or WebP images · Max 8 MB each before compression. First image is the main catalogue photo.</small></label>{(productForm.images?.length ? productForm.images : productForm.image ? [productForm.image] : []).length > 0 && <div className="image-preview-row">{(productForm.images?.length ? productForm.images : [productForm.image]).map((src,index)=><img key={index} src={src} alt={`Product preview ${index+1}`}/>) }<span>{productForm.images?.length || 1} gallery image(s) · compressed before upload</span></div>}<label>Or image URL<input type="url" value={productForm.image?.startsWith("data:") ? "" : (productForm.image || "")} onChange={e => setProductForm({ ...productForm, image: e.target.value })} placeholder="https://…"/></label><label>Tray set description *<textarea required maxLength="2000" rows="3" value={productForm.description || ""} onChange={e => setProductForm({ ...productForm, description: e.target.value })} placeholder="Description shown on product details page…"/></label><label>Material / product details<input maxLength="500" value={productForm.material || ""} onChange={e => setProductForm({ ...productForm, material: e.target.value })} placeholder="e.g. Solid wood · Food-safe finish"/></label><label>Care instructions<textarea maxLength="1000" rows="3" value={productForm.care || ""} onChange={e => setProductForm({ ...productForm, care: e.target.value })} placeholder="Care instructions shown on product details page…"/></label><div className="modal-actions"><button type="button" className="ghost-btn" onClick={() => { setProductForm(null); setEditingProduct(false); }}>Cancel</button><button className="gold-btn" type="submit"><Save size={15}/> {editingProduct ? "Save changes" : "Add product"}</button></div></form></div>}
  </main>;
}

export default App;
