"use client";

import React, { useEffect, useMemo, useState } from "react";
import confetti from "canvas-confetti";
import { ArrowLeft, Check, Coins, Gem, Lock, Shirt, Frame as FrameIcon, Palette, Sparkles, Tag, Play, MousePointerClick } from "lucide-react";
import { RARITY_COLORS, SHOP_ITEMS, type CosmeticCategory, type CosmeticItem } from "@/lib/game-engine";
import { BOARD_THEMES, getAvatarColor, type AvatarConfig } from "@/lib/avatar";
import { Character, CharacterAvatar } from "./Character";
import type { Player } from "@/lib/types";
import { soundEngine } from "@/lib/sound-effects";

type Tab = "character" | "frame" | "theme" | "effect" | "title";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "character", label: "Character", icon: Shirt },
  { id: "frame", label: "Frames", icon: FrameIcon },
  { id: "theme", label: "Boards", icon: Palette },
  { id: "effect", label: "Win FX", icon: Sparkles },
  { id: "title", label: "Titles", icon: Tag },
];

function isEquipped(me: Player, item: CosmeticItem): boolean {
  switch (item.category) {
    case "avatar_base": return me.avatarConfig.base === item.meta;
    case "avatar_color": return me.avatarConfig.color === item.meta;
    case "avatar_accessory": return me.avatarConfig.accessory === item.meta;
    case "frame": return me.frameId === item.id;
    case "theme": return me.themeId === item.id;
    case "effect": return me.effectId === item.id;
    case "title": return me.title === item.meta;
  }
}

function previewWith(cfg: AvatarConfig, item: CosmeticItem): AvatarConfig {
  if (item.category === "avatar_base") return { ...cfg, base: item.meta };
  if (item.category === "avatar_color") return { ...cfg, color: item.meta };
  if (item.category === "avatar_accessory") return { ...cfg, accessory: item.meta };
  return cfg;
}

export default function Shop({
  me,
  onBack,
  onBuy,
  onEquip,
  busyId,
}: {
  me: Player;
  onBack: () => void;
  onBuy: (item: CosmeticItem) => void;
  onEquip: (item: CosmeticItem) => void;
  busyId: string | null;
}) {
  const [tab, setTab] = useState<Tab>("character");
  const [selected, setSelected] = useState<CosmeticItem | null>(null);
  const [preview, setPreview] = useState<AvatarConfig>(me.avatarConfig);
  const [previewFrame, setPreviewFrame] = useState(me.frameId);
  const [previewTheme, setPreviewTheme] = useState(me.themeId);
  const [moodTick, setMoodTick] = useState(0);

  // Reset the try-on preview whenever the server confirms a new equipped set.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPreview(me.avatarConfig); setPreviewFrame(me.frameId); setPreviewTheme(me.themeId); }, [me.avatarConfig, me.frameId, me.themeId]);

  const items = useMemo(() => {
    if (tab === "character") return SHOP_ITEMS.filter((i) => i.category.startsWith("avatar_"));
    return SHOP_ITEMS.filter((i) => i.category === tab);
  }, [tab]);

  const select = (item: CosmeticItem) => {
    soundEngine.playTap(560);
    setSelected(item);
    if (item.category.startsWith("avatar_")) setPreview(previewWith(me.avatarConfig, item));
    if (item.category === "frame") setPreviewFrame(item.id);
    if (item.category === "theme") setPreviewTheme(item.id);
    if (item.category === "effect") testEffect(item.id);
  };

  const testEffect = (id: string) => {
    try {
      if (id === "effect_matrix") confetti({ particleCount: 90, spread: 100, colors: ["#00E676", "#58CC02"], shapes: ["square"], origin: { y: 0.4 }, zIndex: 9999 });
      else if (id === "effect_lightning") confetti({ particleCount: 90, spread: 100, colors: ["#FFD93D", "#1CB0F6"], origin: { y: 0.4 }, zIndex: 9999 });
      else if (id === "effect_shockwave") confetti({ particleCount: 110, spread: 360, startVelocity: 26, gravity: 0.3, origin: { y: 0.4 }, colors: ["#FF4B4B", "#FF7A18"], zIndex: 9999 });
      else confetti({ particleCount: 90, spread: 90, origin: { y: 0.4 }, zIndex: 9999 });
    } catch {}
  };

  const owned = (item: CosmeticItem) => me.ownedCosmetics.includes(item.id);
  const canAfford = (item: CosmeticItem) =>
    item.priceCoins ? me.coins >= item.priceCoins : item.priceGems ? me.gems >= item.priceGems : true;

  const ItemCard = ({ item }: { item: CosmeticItem }) => {
    const isSel = selected?.id === item.id;
    const eq = isEquipped(me, item);
    const isOwned = owned(item);
    return (
      <button
        onClick={() => select(item)}
        className="card-game p-2.5 text-left relative transition-transform active:scale-[0.97] hover:-translate-y-0.5"
        style={isSel ? { borderColor: RARITY_COLORS[item.rarity], boxShadow: `0 0 0 2px ${RARITY_COLORS[item.rarity]}, var(--shadow-card)` } : undefined}
      >
        <span className="absolute top-1.5 right-1.5 z-10 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md text-white" style={{ background: RARITY_COLORS[item.rarity] }}>
          {item.rarity}
        </span>
        {eq && (
          <span className="absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: "#58CC02" }}>
            <Check size={12} strokeWidth={3.4} />
          </span>
        )}
        <div className="h-[76px] flex items-center justify-center overflow-hidden rounded-xl" style={{ background: "var(--surface-3)" }}>
          {item.category === "avatar_base" && <Character config={{ ...me.avatarConfig, base: item.meta }} size={72} />}
          {item.category === "avatar_color" && <Character config={{ base: me.avatarConfig.base, color: item.meta, accessory: "none" }} size={72} />}
          {item.category === "avatar_accessory" && <Character config={{ base: me.avatarConfig.base, color: me.avatarConfig.color, accessory: item.meta }} size={72} />}
          {item.category === "frame" && <CharacterAvatar config={me.avatarConfig} frameId={item.id} size={62} />}
          {item.category === "theme" && (
            <div className="w-full h-full p-1.5 board-theme" data-board={item.id}>
              <div className="flex gap-1 justify-center mt-2">
                {["4", "8", "2", "9"].map((d) => <span key={d} className="digit-tile w-6 h-7 flex items-center justify-center text-sm">{d}</span>)}
              </div>
              <div className="mx-auto mt-1.5 h-2 w-3/4 rounded-full" style={{ background: BOARD_THEMES.find((t) => t.id === item.id)?.swatch }} />
            </div>
          )}
          {item.category === "effect" && (
            <span className="w-14 h-14 rounded-2xl flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#A560E8,#1CB0F6)" }}>
              <Sparkles size={28} strokeWidth={2.4} />
            </span>
          )}
          {item.category === "title" && (
            <span className="chip px-3 py-1.5 font-display font-semibold text-sm" style={{ color: RARITY_COLORS[item.rarity] }}>{item.meta}</span>
          )}
        </div>
        <p className="font-display font-semibold text-[13px] leading-tight mt-1.5 truncate">{item.name}</p>
        <div className="mt-0.5">
          {eq ? (
            <span className="text-[11px] font-black" style={{ color: "#58CC02" }}>EQUIPPED</span>
          ) : isOwned ? (
            <span className="text-[11px] font-black" style={{ color: "var(--blue)" }}>OWNED</span>
          ) : item.priceGems ? (
            <span className="text-[12px] font-black flex items-center gap-1" style={{ color: "#1CB0F6" }}><Gem size={13} /> {item.priceGems}</span>
          ) : item.priceCoins ? (
            <span className="text-[12px] font-black flex items-center gap-1" style={{ color: "#E0A800" }}><Coins size={13} /> {item.priceCoins}</span>
          ) : (
            <span className="text-[11px] font-black" style={{ color: "#58CC02" }}>FREE</span>
          )}
        </div>
      </button>
    );
  };

  const sel = selected;
  const selOwned = sel ? owned(sel) : false;
  const selEquipped = sel ? isEquipped(me, sel) : false;

  const charSection = (cat: CosmeticCategory, label: string) => (
    <div>
      <h3 className="font-display font-semibold text-sm uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>{label}</h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
        {SHOP_ITEMS.filter((i) => i.category === cat).map((item) => <ItemCard key={item.id} item={item} />)}
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-5 pb-40 animate-fade">
      {/* header */}
      <div className="flex items-center gap-2 py-3 sticky top-0 z-20" style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)", backdropFilter: "blur(10px)" }}>
        <button onClick={onBack} className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={19} strokeWidth={2.8} />
        </button>
        <h2 className="font-display font-bold text-2xl flex-1">Shop &amp; Customize</h2>
        <span className="chip px-3 py-1.5 font-black flex items-center gap-1.5"><Coins size={16} style={{ color: "#E0A800" }} /> {me.coins.toLocaleString()}</span>
        <span className="chip px-3 py-1.5 font-black flex items-center gap-1.5"><Gem size={16} style={{ color: "#1CB0F6" }} /> {me.gems.toLocaleString()}</span>
      </div>

      {/* live preview stage */}
      <div className="board-theme rounded-3xl border-2 p-4 flex flex-col sm:flex-row items-center gap-4 mb-4" data-board={previewTheme}
        style={{ borderColor: "var(--board-border)" }}>
        <button onClick={() => { setMoodTick((t) => t + 1); soundEngine.playTap(760); }} className="relative active:scale-95 transition-transform" title="Tap to make them jump!">
          <CharacterAvatar
            key={moodTick}
            config={preview}
            frameId={previewFrame}
            mood={moodTick % 3 === 1 ? "happy" : moodTick % 3 === 2 ? "win" : "idle"}
            size={148}
            ringWidth={6}
          />
        </button>
        <div className="text-center sm:text-left flex-1" style={{ color: "var(--board-ink)" }}>
          <p className="font-display font-bold text-xl leading-tight">{me.username}</p>
          <p className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--board-soft)" }}>{sel?.category === "title" ? sel.meta : me.title} · {me.division}</p>
          <div className="flex gap-1 justify-center sm:justify-start mt-2.5">
            {["4", "8", "2", "9"].map((d) => <span key={d} className="digit-tile w-8 h-9 flex items-center justify-center">{d}</span>)}
          </div>
          <p className="text-xs font-bold mt-2 flex items-center gap-1 justify-center sm:justify-start" style={{ color: "var(--board-soft)" }}>
            <MousePointerClick size={13} /> Live preview — tap items below to try them on. Tap your character to play!
          </p>
          <p className="text-[11px] font-bold mt-1" style={{ color: "var(--board-soft)" }}>
            Wearing: {getAvatarColor(preview.color).name} · Board: {BOARD_THEMES.find((t) => t.id === previewTheme)?.name}
          </p>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-4 -mx-1 px-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => { setTab(t.id); setSelected(null); soundEngine.playTap(500); }}
              className={`btn-game px-4 py-2.5 flex items-center gap-1.5 whitespace-nowrap ${active ? "btn-purple" : "btn-ghost"}`}>
              <Icon size={16} strokeWidth={2.6} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* items */}
      {tab === "character" ? (
        <div className="space-y-5">
          {charSection("avatar_base", "Choose your character")}
          {charSection("avatar_color", "Colors")}
          {charSection("avatar_accessory", "Accessories")}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          {items.map((item) => <ItemCard key={item.id} item={item} />)}
        </div>
      )}

      <p className="text-center text-xs font-bold mt-6" style={{ color: "var(--ink-faint)" }}>
        Earn coins by winning matches · Gems come from quests, streaks &amp; achievements
      </p>

      {/* sticky detail / buy bar */}
      {sel && (
        <div className="fixed bottom-0 inset-x-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto card-game p-3 flex items-center gap-3 animate-slide-up">
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold leading-tight truncate">
                {sel.name}
                <span className="ml-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md text-white align-middle" style={{ background: RARITY_COLORS[sel.rarity] }}>{sel.rarity}</span>
              </p>
              <p className="text-xs font-bold truncate" style={{ color: "var(--ink-soft)" }}>{sel.description}</p>
            </div>
            {sel.category === "effect" && (
              <button onClick={() => testEffect(sel.id)} className="btn-game btn-ghost px-3 py-3 flex items-center gap-1 text-xs">
                <Play size={14} strokeWidth={2.7} /> Test
              </button>
            )}
            {selEquipped ? (
              <span className="chip px-4 py-3 font-black text-sm flex items-center gap-1.5" style={{ color: "#58CC02" }}><Check size={16} strokeWidth={3} /> Equipped</span>
            ) : selOwned ? (
              <button onClick={() => onEquip(sel)} disabled={busyId === sel.id} className="btn-game btn-blue px-5 py-3">
                {busyId === sel.id ? "..." : "Equip"}
              </button>
            ) : (
              <button
                onClick={() => onBuy(sel)}
                disabled={busyId === sel.id || !canAfford(sel)}
                className={`btn-game px-5 py-3 flex items-center gap-1.5 ${canAfford(sel) ? "btn-green" : "btn-ghost"}`}
              >
                {busyId === sel.id ? "..." : !canAfford(sel) ? <><Lock size={15} /> Not enough</> : sel.priceGems ? <><Gem size={16} /> Buy · {sel.priceGems}</> : <><Coins size={16} /> Buy · {sel.priceCoins ?? 0}</>}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
