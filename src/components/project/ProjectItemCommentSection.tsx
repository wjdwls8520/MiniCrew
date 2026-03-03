'use client';

import React, { useMemo, useState } from 'react';
import { MessageSquare, CornerDownRight } from 'lucide-react';
import type { ProjectItemComment } from '@/types/workflow';

interface ProjectItemCommentSectionProps {
    itemId: string;
    comments: ProjectItemComment[];
    canWriteComment: boolean;
    onSubmitComment: (input: {
        itemId: string;
        body: string;
        parentCommentId?: string | null;
    }) => Promise<void>;
}

function formatCommentDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

export function ProjectItemCommentSection({
    itemId,
    comments,
    canWriteComment,
    onSubmitComment,
}: ProjectItemCommentSectionProps) {
    const [commentBody, setCommentBody] = useState('');
    const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
    const [replyBody, setReplyBody] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const groupedComments = useMemo(() => {
        const roots = comments.filter((comment) => !comment.parentCommentId);
        const repliesByParent = new Map<string, ProjectItemComment[]>();

        comments
            .filter((comment) => Boolean(comment.parentCommentId))
            .forEach((comment) => {
                const parentId = comment.parentCommentId ?? '';
                const prev = repliesByParent.get(parentId) ?? [];
                repliesByParent.set(parentId, [...prev, comment]);
            });

        return roots.map((root) => ({
            root,
            replies: repliesByParent.get(root.id) ?? [],
        }));
    }, [comments]);

    const handleSubmitRoot = async (event: React.FormEvent) => {
        event.preventDefault();
        const nextBody = commentBody.trim();
        if (!nextBody || isSubmitting) {
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmitComment({ itemId, body: nextBody, parentCommentId: null });
            setCommentBody('');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmitReply = async (event: React.FormEvent) => {
        event.preventDefault();
        const parentId = replyTargetId;
        const nextBody = replyBody.trim();
        if (!parentId || !nextBody || isSubmitting) {
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmitComment({ itemId, body: nextBody, parentCommentId: parentId });
            setReplyBody('');
            setReplyTargetId(null);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="rounded-xl border border-gray-100 bg-white p-4">
            <div className="mb-3 flex items-center gap-1 text-sm font-semibold text-gray-700">
                <MessageSquare className="h-4 w-4" />
                댓글 {comments.length}개
            </div>

            {groupedComments.length === 0 ? (
                <p className="mb-3 text-xs text-gray-400">아직 댓글이 없습니다.</p>
            ) : (
                <ul className="mb-3 space-y-3">
                    {groupedComments.map(({ root, replies }) => (
                        <li key={root.id} className="space-y-2">
                            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-gray-700">{root.authorName}</span>
                                    <span className="text-[11px] text-gray-400">{formatCommentDate(root.createdAt)}</span>
                                </div>
                                <p className="whitespace-pre-wrap text-sm text-gray-800">{root.body}</p>
                                {canWriteComment && (
                                    <div className="mt-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setReplyTargetId((prev) => (prev === root.id ? null : root.id));
                                                setReplyBody('');
                                            }}
                                            className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
                                        >
                                            답글 달기
                                        </button>
                                    </div>
                                )}
                            </div>

                            {replyTargetId === root.id && canWriteComment && (
                                <form onSubmit={handleSubmitReply} className="ml-4 flex gap-2">
                                    <textarea
                                        value={replyBody}
                                        onChange={(event) => setReplyBody(event.target.value)}
                                        rows={2}
                                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
                                        placeholder="답글을 입력하세요."
                                    />
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || !replyBody.trim()}
                                        className="h-fit rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 cursor-pointer"
                                    >
                                        등록
                                    </button>
                                </form>
                            )}

                            {replies.length > 0 && (
                                <ul className="ml-4 space-y-2 border-l border-gray-200 pl-3">
                                    {replies.map((reply) => (
                                        <li key={reply.id} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
                                            <div className="mb-1 flex items-center justify-between gap-2">
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
                                                    <CornerDownRight className="h-3 w-3 text-gray-400" />
                                                    {reply.authorName}
                                                </span>
                                                <span className="text-[11px] text-gray-400">{formatCommentDate(reply.createdAt)}</span>
                                            </div>
                                            <p className="whitespace-pre-wrap text-sm text-gray-800">{reply.body}</p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {canWriteComment ? (
                <form onSubmit={handleSubmitRoot} className="flex gap-2">
                    <textarea
                        value={commentBody}
                        onChange={(event) => setCommentBody(event.target.value)}
                        rows={2}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
                        placeholder="댓글을 입력하세요."
                    />
                    <button
                        type="submit"
                        disabled={isSubmitting || !commentBody.trim()}
                        className="h-fit rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 cursor-pointer"
                    >
                        등록
                    </button>
                </form>
            ) : (
                <p className="text-xs text-gray-500">댓글 작성은 프로젝트 멤버만 가능합니다.</p>
            )}
        </div>
    );
}
