import { ArrowUpRight, ImagePlus, Layers3 } from 'lucide-react';
import './inspiration.css';

export default function Inspiration({ onUpload, onOpenMarket }) {
  return <div className="inspiration-home">
    <div className="creation-shortcuts" aria-label="创作入口">
      <button onClick={onOpenMarket}><span className="shortcut-icon"><Layers3 size={20} /></span><span><strong>风格市场</strong><small>选择喜欢的风格，开始创作</small></span><ArrowUpRight size={18} /></button>
      <button onClick={onUpload}><span className="shortcut-icon"><ImagePlus size={20} /></span><span><strong>从参考图开始</strong><small>上传图片，接着创作</small></span><ArrowUpRight size={18} /></button>
    </div>
  </div>;
}
