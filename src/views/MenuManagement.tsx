import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../translations/translations';
import { 
  MenuSquare, Plus, X, Edit, Trash2,
  ToggleLeft, ToggleRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MenuItem, MenuItemVariant } from '../types/types';
import { toast } from 'sonner';

type PortionMode = 'Single' | 'Variant';
type CategoryType = 'Vegetarian' | 'Egg Curry' | 'Breads' | 'Rice' | 'Papad' | 'Starters' | 'Curries' | 'Handi Dishes';

const MenuManagement: React.FC = () => {
  const { menuItems, addMenuItem, updateMenuItem, deleteMenuItem, language } = useApp();
  const t = translations[language];

  const getCategoryLabel = (cat: CategoryType | 'All') => {
    switch(cat) {
      case 'All': return language === 'mr' ? 'सर्व आयटम (All)' : 'All Items';
      case 'Vegetarian': return language === 'mr' ? 'वेज (Veg)' : 'Vegetarian';
      case 'Egg Curry': return language === 'mr' ? 'अंडा करी (Egg)' : 'Egg Curry';
      case 'Breads': return language === 'mr' ? 'चपाती (Breads)' : 'Breads';
      case 'Rice': return language === 'mr' ? 'राईस (Rice)' : 'Rice';
      case 'Papad': return language === 'mr' ? 'पापड (Papad)' : 'Papad';
      case 'Starters': return language === 'mr' ? 'स्टार्टर (Starters)' : 'Starters';
      case 'Curries': return language === 'mr' ? 'करी (Curries)' : 'Curries';
      case 'Handi Dishes': return language === 'mr' ? 'हांडी (Handi)' : 'Handi Dishes';
    }
  };

  // Filters state
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryType>('Vegetarian');
  const [portionMode, setPortionMode] = useState<PortionMode>('Single');
  const [singlePrice, setSinglePrice] = useState<number>(100);
  const [singlePrepTime, setSinglePrepTime] = useState<number>(10);
  
  // Variants sub-list
  const [variantsList, setVariantsList] = useState<MenuItemVariant[]>([]);
  const [varName, setVarName] = useState('');
  const [varPrice, setVarPrice] = useState<number>(100);
  const [varPrepTime, setVarPrepTime] = useState<number>(10);

  const filteredItems = menuItems.filter(m => {
    const matchesCategory = selectedCategory === 'All' || m.category === selectedCategory;
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          m.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleOpenAddModal = () => {
    setEditingItem(null);
    setName('');
    setCategory('Vegetarian');
    setPortionMode('Single');
    setSinglePrice(150);
    setSinglePrepTime(10);
    setVariantsList([]);
    setVarName('');
    setVarPrice(100);
    setVarPrepTime(10);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setName(item.name);
    setCategory(item.category as CategoryType);
    setPortionMode(item.portionMode);
    setSinglePrice(item.price || 0);
    setSinglePrepTime(item.prepTime || 10);
    setVariantsList(item.variants || []);
    setIsModalOpen(true);
  };

  const handleAddVariant = () => {
    if (!varName.trim() || varPrice <= 0 || varPrepTime <= 0) {
      toast.error('Enter valid variant details');
      return;
    }
    if (variantsList.some(v => v.name.toLowerCase() === varName.toLowerCase())) {
      toast.error('Variant name already exists');
      return;
    }
    setVariantsList(prev => [...prev, { name: varName, price: varPrice, prepTime: varPrepTime }]);
    setVarName('');
    setVarPrice(100);
    setVarPrepTime(10);
  };

  const handleRemoveVariant = (idx: number) => {
    setVariantsList(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (portionMode === 'Variant' && variantsList.length === 0) {
      toast.error('Add at least one variant for Variant Mode');
      return;
    }

    const payload = {
      name,
      category,
      portionMode,
      price: portionMode === 'Single' ? singlePrice : 0,
      prepTime: portionMode === 'Single' ? singlePrepTime : 0,
      variants: portionMode === 'Variant' ? variantsList : [],
      isAvailable: editingItem ? editingItem.isAvailable : true
    };

    if (editingItem) {
      updateMenuItem(editingItem.id, payload);
    } else {
      addMenuItem(payload);
    }

    setIsModalOpen(false);
  };

  const toggleAvailability = (item: MenuItem) => {
    updateMenuItem(item.id, { isAvailable: !item.isAvailable });
    toast.success(`${item.name} status set to ${!item.isAvailable ? 'In Stock' : 'Out of Stock'}`);
  };

  const handleDeleteItem = (item: MenuItem) => {
    if (window.confirm(`Delete "${item.name}" from the menu? This cannot be undone.`)) {
      deleteMenuItem(item.id);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 m-0 tracking-tight">{t.menu}</h2>
          <p className="text-xs text-slate-500 font-medium mt-1">Configure food items, portion pricing, and availability states.</p>
        </div>
        
        <button
          onClick={handleOpenAddModal}
          className="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-450 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-500/10 transition"
        >
          <Plus size={14} />
          <span>{t.addMenuItem}</span>
        </button>
      </div>

      {/* Category Navigation Bar */}
      <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-200">
        {(['All', 'Vegetarian', 'Egg Curry', 'Breads', 'Rice', 'Papad', 'Starters', 'Curries', 'Handi Dishes'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedCategory === cat
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 shadow-sm'
                : 'bg-white border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-800'
            }`}
          >
            {getCategoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-slate-200 p-3.5 rounded-3xl shadow-xs flex items-center gap-2">
        <input
          type="text"
          placeholder="Search dishes by name or category..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
        />
        {searchQuery && (
          <button 
            onClick={() => setSearchQuery('')}
            className="px-3 py-2 text-[10px] bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-550 hover:text-slate-800 cursor-pointer transition"
          >
            Clear
          </button>
        )}
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredItems.map(item => (
          <div
            key={item.id}
            className={`rounded-2xl border bg-white border-slate-200 overflow-hidden flex flex-col justify-between h-48 hover:border-slate-350 transition duration-300 shadow-sm ${
              !item.isAvailable ? 'opacity-60' : ''
            }`}
          >
            {/* Header info */}
            <div className="p-4 space-y-1">
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-bold uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-150">
                  {getCategoryLabel(item.category as CategoryType)}
                </span>
                <span className={`w-2.5 h-2.5 rounded-full ${item.isAvailable ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              </div>
              
              <h4 className="text-sm font-bold text-slate-800 truncate">{item.name}</h4>
              
              {/* Pricing detail */}
              <div className="text-xs font-semibold text-slate-500 pt-1 font-mono">
                {item.portionMode === 'Single' ? (
                  <span>₹{item.price} &bull; {item.prepTime} {t.mins}</span>
                ) : (
                  <div className="flex gap-1.5 flex-wrap">
                    {item.variants.map((v, idx) => (
                      <span key={idx} className="bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] text-emerald-600 font-bold">
                        {v.name}: ₹{v.price}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions bottom row */}
            <div className="p-3 border-t border-slate-150 bg-slate-50 flex justify-between items-center">
              
              {/* Availability stock toggle */}
              <button
                onClick={() => toggleAvailability(item)}
                className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer transition"
              >
                {item.isAvailable ? (
                  <>
                    <ToggleRight size={20} className="text-emerald-500" />
                    <span>In Stock</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft size={20} className="text-rose-500" />
                    <span>Out of Stock</span>
                  </>
                )}
              </button>

              {/* Edit + Delete buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleOpenEditModal(item)}
                  className="p-2 rounded bg-white border border-slate-200 hover:border-slate-350 text-slate-550 hover:text-slate-800 cursor-pointer transition shadow-xs"
                  title="Edit Item"
                >
                  <Edit size={12} />
                </button>
                <button
                  onClick={() => handleDeleteItem(item)}
                  className="p-2 rounded bg-white border border-slate-200 hover:border-rose-300 text-slate-550 hover:text-rose-600 cursor-pointer transition shadow-xs"
                  title="Delete Item"
                >
                  <Trash2 size={12} />
                </button>
              </div>

            </div>

          </div>
        ))}
      </div>

      {/* Glass Modal overlay for Add/Edit Menu */}
      <AnimatePresence>
        {isModalOpen && (
          <>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setIsModalOpen(false)} />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 px-6 pt-6 pb-0 rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-y-auto max-h-[90vh] text-slate-800"
            >
              <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
                <h3 className="text-sm font-extrabold uppercase text-slate-900 flex items-center gap-2">
                  <MenuSquare size={16} className="text-emerald-500" />
                  {editingItem ? 'Edit Menu Item' : t.addMenuItem}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-1 rounded bg-slate-50 border border-slate-200 hover:text-slate-800 cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 pb-6">
                
                {/* Name */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Item Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Paneer Butter Masala"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-850 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                {/* Category & Portion Mode Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Category</label>
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value as CategoryType)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="Vegetarian">Vegetarian (वेज)</option>
                      <option value="Egg Curry">Egg Curry (अंडा करी)</option>
                      <option value="Breads">Breads (चपाती)</option>
                      <option value="Rice">Rice (राईस)</option>
                      <option value="Papad">Papad (पापड)</option>
                      <option value="Starters">Starters (स्टार्टर)</option>
                      <option value="Curries">Curries (करी)</option>
                      <option value="Handi Dishes">Handi Dishes (हांडी)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Portion Mode</label>
                    <select
                      value={portionMode}
                      onChange={e => setPortionMode(e.target.value as PortionMode)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="Single">{t.singlePortion}</option>
                      <option value="Variant">{t.variantMode}</option>
                    </select>
                  </div>
                </div>

                {/* 1. Fields for Single Portion Mode */}
                {portionMode === 'Single' && (
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-150">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Price (₹)</label>
                      <input
                        type="number"
                        min="1"
                        value={singlePrice}
                        onChange={e => setSinglePrice(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Prep Time (Mins)</label>
                      <input
                        type="number"
                        min="1"
                        value={singlePrepTime}
                        onChange={e => setSinglePrepTime(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {/* 2. Fields for Variant Portion Mode */}
                {portionMode === 'Variant' && (
                  <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-150">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block tracking-wider mb-1">Add Portion Variants</span>
                    
                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1">Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Half"
                          value={varName}
                          onChange={e => setVarName(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 text-xs rounded text-slate-800 focus:outline-none"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1">Price (₹)</label>
                        <input
                          type="number"
                          value={varPrice}
                          onChange={e => setVarPrice(parseInt(e.target.value) || 0)}
                          className="w-full p-2 bg-white border border-slate-200 text-xs rounded text-slate-800 focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-1.5 items-center">
                        <div className="flex-1">
                          <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1">Prep (m)</label>
                          <input
                            type="number"
                            value={varPrepTime}
                            onChange={e => setVarPrepTime(parseInt(e.target.value) || 0)}
                            className="w-full p-2 bg-white border border-slate-200 text-xs rounded text-slate-800 focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAddVariant}
                          className="p-2 bg-emerald-500 hover:bg-emerald-450 text-white rounded font-bold text-xs cursor-pointer transition"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Render current variants list */}
                    {variantsList.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5 max-h-36 overflow-y-auto">
                        {variantsList.map((v, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs py-1.5 border-b border-slate-100 last:border-b-0">
                            <span className="font-bold text-slate-650">{v.name} &bull; Price: ₹{v.price} &bull; Prep: {v.prepTime}m</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveVariant(idx)}
                              className="text-rose-600 hover:underline text-[10px] cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-450 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition shadow-lg shadow-emerald-500/10 mt-4"
                >
                  Save Menu Item
                </button>
              </form>

            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
};

export default MenuManagement;
