
import { ThumbsUp, ThumbsDown, Share2, MessageSquare, MoreVertical } from 'lucide-react';
import type { PostSummary } from '../../types/video';

interface PostCardProps {
  post: PostSummary;
}

export function PostCard({ post }: PostCardProps) {
  return (
    <div className="w-full max-w-3xl mx-auto bg-surface border border-zinc-800/60 rounded-2xl p-4 sm:p-5 shadow-sm transition-colors hover:border-zinc-700/80 mb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden shrink-0 border border-zinc-800">
            {post.authorAvatar ? (
              <img src={post.authorAvatar} alt={post.authorName || "Author"} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500 font-bold">
                {(post.authorName || "?").charAt(0)}
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-100 font-bold text-sm">{post.authorName || "Anonymous"}</span>
              <span className="text-zinc-500 text-xs">{post.publishedTimeText || 'Recently'}</span>
            </div>
          </div>
        </div>
        <button className="text-zinc-400 hover:text-zinc-200 transition-colors p-1 rounded-full hover:bg-zinc-800">
          <MoreVertical size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="pl-[52px]">
        {post.textContent && (
          <p className="text-zinc-100 text-sm whitespace-pre-wrap leading-relaxed mb-3 font-medium">
            {post.textContent}
          </p>
        )}

        {post.imageAttachment && (
          <div className="w-full rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-4 max-h-[600px] flex items-center justify-center">
            <img 
              src={post.imageAttachment} 
              alt="Post attachment" 
              className="w-full h-full object-cover md:object-contain" 
            />
          </div>
        )}

        {/* Action Row */}
        <div className="flex items-center gap-2 mt-3">
          {/* Like / Dislike Group */}
          <div className="flex items-center bg-zinc-800/60 rounded-full">
            <button className="flex items-center gap-2 text-zinc-100 hover:bg-zinc-700 px-3 py-1.5 rounded-l-full transition-colors text-sm font-bold border-r border-zinc-700/50">
              <ThumbsUp size={16} />
              {post.likesCountText && <span>{post.likesCountText}</span>}
            </button>
            <button className="flex items-center text-zinc-100 hover:bg-zinc-700 px-3 py-1.5 rounded-r-full transition-colors">
              <ThumbsDown size={16} />
            </button>
          </div>

          <button className="flex items-center gap-2 text-zinc-100 bg-zinc-800/60 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition-colors text-sm font-bold">
            <Share2 size={16} />
            <span className="hidden sm:inline">Share</span>
          </button>

          <button className="flex items-center gap-2 text-zinc-100 bg-zinc-800/60 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition-colors text-sm font-bold">
            <MessageSquare size={16} />
            <span>199</span>
          </button>
        </div>
      </div>
    </div>
  );
}
