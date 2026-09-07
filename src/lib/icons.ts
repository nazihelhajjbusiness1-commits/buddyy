/*
 * Bundled Lucide icons.
 *
 * Instead of pulling the whole icon library from a CDN <script> (which blocks
 * rendering and ships every icon), we import only the icons this app actually
 * uses and hand them to createIcons(). Vite tree-shakes the rest away.
 *
 * createIcons() scans the DOM for [data-lucide="kebab-name"] and swaps in the
 * matching SVG, so any icon referenced in markup must be listed here.
 */
import {
  createIcons,
  ArrowLeft,
  ArrowUp,
  Bot,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  FileCheck,
  FileText,
  GraduationCap,
  Loader,
  Lock,
  LogOut,
  Mail,
  MessagesSquare,
  Mic,
  MicOff,
  Newspaper,
  PanelLeft,
  Paperclip,
  Pause,
  Pencil,
  PencilRuler,
  Play,
  Plus,
  Presentation,
  RotateCcw,
  ShieldCheck,
  Target,
  Timer,
  Trash2,
  UserRound,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide';

const icons = {
  ArrowLeft,
  ArrowUp,
  Bot,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  FileCheck,
  FileText,
  GraduationCap,
  Loader,
  Lock,
  LogOut,
  Mail,
  MessagesSquare,
  Mic,
  MicOff,
  Newspaper,
  PanelLeft,
  Paperclip,
  Pause,
  Pencil,
  PencilRuler,
  Play,
  Plus,
  Presentation,
  RotateCcw,
  ShieldCheck,
  Target,
  Timer,
  Trash2,
  UserRound,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
};

/** Replaces every [data-lucide] placeholder in the DOM with its SVG. */
export function refreshIcons(): void {
  createIcons({ icons });
}
