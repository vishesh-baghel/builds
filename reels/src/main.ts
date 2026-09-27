/** The player page with every reel. */
import { boot } from "./player.js";
import { reckon } from "./reels/reckon.js";
import { sift } from "./reels/sift.js";
import { tally } from "./reels/tally.js";

void boot([tally, reckon, sift]);
