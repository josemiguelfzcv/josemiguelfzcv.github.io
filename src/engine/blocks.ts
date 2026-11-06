import { TILE_INDEX, TileName } from './textures';

export const enum B {
  Air = 0,
  Grass, Dirt, DirtPath, Stone, Cobble, MossyCobble, Sand, Gravel,
  OakLog, OakLeaves, OakPlanks, SprucePlanks, SpruceLog, BirchPlanks,
  StoneBricks, MossyStoneBricks, CrackedStoneBricks, Bricks, Glass, Bookshelf,
  CraftingTable, Chest, Furnace,
  Netherrack, NetherBricks, RedNetherBricks, Glowstone, Obsidian, CryingObsidian, Bedrock,
  Magma, Basalt, Blackstone, GildedBlackstone, SoulSand, NetherWart, WarpedNylium, RedSand,
  Quartz, Gold, Iron, Hay,
  WoolWhite, WoolRed, WoolBlue, WoolBlack, WoolCyan, WoolYellow,
  Painting, Screen, Black,
  Lantern, // emits light; rendered as a full block for simplicity (used inside details)
  SeaLantern,
  Plaster, DarkOakPlanks, Shingles, Slate, SpruceLeaves,
  COUNT,
}

export interface BlockDef {
  /** tile per face: [top, bottom, north(-z), south(+z), west(-x), east(+x)] */
  tiles: [number, number, number, number, number, number];
  opaque: boolean;
  /** transparent blocks are rendered in a second pass with alpha */
  transparent?: boolean;
  /** emitted block light (r,g,b) in 0..15 */
  light?: [number, number, number];
}

const t = (n: TileName) => TILE_INDEX[n];
const all = (n: TileName): BlockDef['tiles'] => { const i = t(n); return [i, i, i, i, i, i]; };
const tsb = (top: TileName, side: TileName, bottom: TileName): BlockDef['tiles'] => [t(top), t(bottom), t(side), t(side), t(side), t(side)];

export const BLOCKS: BlockDef[] = [];
const def = (id: B, d: BlockDef) => { BLOCKS[id] = d; };

def(B.Air, { tiles: all('white'), opaque: false });
def(B.Grass, { tiles: tsb('grass_top', 'grass_side', 'dirt'), opaque: true });
def(B.Dirt, { tiles: all('dirt'), opaque: true });
def(B.DirtPath, { tiles: tsb('dirt_path', 'dirt', 'dirt'), opaque: true });
def(B.Stone, { tiles: all('stone'), opaque: true });
def(B.Cobble, { tiles: all('cobble'), opaque: true });
def(B.MossyCobble, { tiles: all('mossy_cobble'), opaque: true });
def(B.Sand, { tiles: all('sand'), opaque: true });
def(B.Gravel, { tiles: all('gravel'), opaque: true });
def(B.OakLog, { tiles: tsb('oak_log_top', 'oak_log', 'oak_log_top'), opaque: true });
def(B.OakLeaves, { tiles: all('oak_leaves'), opaque: true });
def(B.OakPlanks, { tiles: all('oak_planks'), opaque: true });
def(B.SprucePlanks, { tiles: all('spruce_planks'), opaque: true });
def(B.SpruceLog, { tiles: tsb('spruce_log_top', 'spruce_log', 'spruce_log_top'), opaque: true });
def(B.BirchPlanks, { tiles: all('birch_planks'), opaque: true });
def(B.StoneBricks, { tiles: all('stone_bricks'), opaque: true });
def(B.MossyStoneBricks, { tiles: all('mossy_stone_bricks'), opaque: true });
def(B.CrackedStoneBricks, { tiles: all('cracked_stone_bricks'), opaque: true });
def(B.Bricks, { tiles: all('bricks'), opaque: true });
def(B.Glass, { tiles: all('glass'), opaque: false, transparent: true });
def(B.Bookshelf, { tiles: tsb('oak_planks', 'bookshelf', 'oak_planks'), opaque: true });
def(B.CraftingTable, { tiles: tsb('crafting_top', 'crafting_side', 'oak_planks'), opaque: true });
def(B.Chest, { tiles: [t('chest_side'), t('chest_side'), t('chest_side'), t('chest_front'), t('chest_side'), t('chest_side')], opaque: true });
def(B.Furnace, { tiles: [t('furnace_side'), t('furnace_side'), t('furnace_side'), t('furnace_front'), t('furnace_side'), t('furnace_side')], opaque: true, light: [6, 3, 0] });
def(B.Netherrack, { tiles: all('netherrack'), opaque: true });
def(B.NetherBricks, { tiles: all('nether_bricks'), opaque: true });
def(B.RedNetherBricks, { tiles: all('red_nether_bricks'), opaque: true });
def(B.Glowstone, { tiles: all('glowstone'), opaque: true, light: [15, 12, 6] });
def(B.Obsidian, { tiles: all('obsidian'), opaque: true });
def(B.CryingObsidian, { tiles: all('crying_obsidian'), opaque: true, light: [8, 3, 12] });
def(B.Bedrock, { tiles: all('bedrock'), opaque: true });
def(B.Magma, { tiles: all('magma'), opaque: true, light: [8, 3, 0] });
def(B.Basalt, { tiles: tsb('basalt_top', 'basalt', 'basalt_top'), opaque: true });
def(B.Blackstone, { tiles: all('blackstone'), opaque: true });
def(B.GildedBlackstone, { tiles: all('gilded_blackstone'), opaque: true });
def(B.SoulSand, { tiles: all('soul_sand'), opaque: true });
def(B.NetherWart, { tiles: all('nether_wart'), opaque: true });
def(B.WarpedNylium, { tiles: tsb('warped_nylium', 'netherrack', 'netherrack'), opaque: true });
def(B.RedSand, { tiles: all('red_sand'), opaque: true });
def(B.Quartz, { tiles: all('quartz'), opaque: true });
def(B.Gold, { tiles: all('gold'), opaque: true });
def(B.Iron, { tiles: all('iron'), opaque: true });
def(B.Hay, { tiles: tsb('hay', 'hay', 'hay'), opaque: true });
def(B.WoolWhite, { tiles: all('wool_white'), opaque: true });
def(B.WoolRed, { tiles: all('wool_red'), opaque: true });
def(B.WoolBlue, { tiles: all('wool_blue'), opaque: true });
def(B.WoolBlack, { tiles: all('wool_black'), opaque: true });
def(B.WoolCyan, { tiles: all('wool_cyan'), opaque: true });
def(B.WoolYellow, { tiles: all('wool_yellow'), opaque: true });
def(B.Painting, { tiles: all('painting'), opaque: true });
def(B.Screen, { tiles: all('screen'), opaque: true, light: [4, 6, 9] });
def(B.Black, { tiles: all('black'), opaque: true });
def(B.Lantern, { tiles: all('lantern'), opaque: false, transparent: true, light: [15, 11, 6] });
def(B.Plaster, { tiles: all('plaster'), opaque: true });
def(B.DarkOakPlanks, { tiles: all('dark_oak_planks'), opaque: true });
def(B.Shingles, { tiles: all('shingles'), opaque: true });
def(B.Slate, { tiles: all('slate'), opaque: true });
def(B.SpruceLeaves, { tiles: all('spruce_leaves'), opaque: true });
def(B.SeaLantern, { tiles: all('sea_lantern'), opaque: true, light: [3, 7, 11] });

export const isOpaque = (id: number) => id !== B.Air && !!BLOCKS[id]?.opaque;
