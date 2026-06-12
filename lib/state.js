// Generic list + membership state, persisted to localStorage scoped by app namespace.
window.ProtoKit = window.ProtoKit || {};

ProtoKit.state = (function(){
  const ns = () => `protokit:${ProtoKit.config.brand.name.toLowerCase().replace(/\s+/g,"-")}`;

  function load(key, fallback){
    try{
      const raw = localStorage.getItem(ns() + ":" + key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(_){ return fallback; }
  }
  function save(key, val){
    localStorage.setItem(ns() + ":" + key, JSON.stringify(val));
  }

  const state = {
    lists: [],
    membership: {},
    selectedSwatch: null
  };

  function init(){
    const cfg = ProtoKit.config;
    const persisted = load("lists", null);
    if(persisted){
      state.lists = persisted;
    }else{
      state.lists = [
        Object.assign({ isDefault: true, count: 0 }, cfg.defaultList),
        ...(cfg.customLists || []).map(l => Object.assign({ isDefault: false, count: 0 }, l))
      ];
    }
    state.membership = load("membership", {});
    if(!state.membership[cfg.item.id]) state.membership[cfg.item.id] = [];
    state.selectedSwatch = (cfg.swatches && cfg.swatches[0]) || cfg.brand.color;
  }

  return {
    init,
    get: () => state,
    saveLists: () => save("lists", state.lists),
    saveMembership: () => save("membership", state.membership)
  };
})();
