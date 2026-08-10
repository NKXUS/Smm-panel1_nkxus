<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Blog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class BlogController extends Controller
{
    public function options()
    {
        return $this->apiResponse(['status' => true]);
    }

    public function index()
    {
        $blogs = Blog::orderBy('id', 'DESC')->get();

        return $this->apiResponse([
            'status' => true,
            'data' => $blogs,
        ]);
    }

    public function show($id)
    {
        $blog = Blog::find($id);

        if (!$blog) {
            return $this->apiResponse([
                'status' => false,
                'message' => 'Blog not found.',
            ], 404);
        }

        return $this->apiResponse([
            'status' => true,
            'data' => $blog,
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'title' => 'required|max:255',
            'category' => 'nullable|max:100',
            'short_description' => 'nullable',
            'content' => 'nullable',
            'image' => 'nullable|image|mimes:jpg,jpeg,png,webp,gif|max:4096',
            'meta_title' => 'nullable|max:255',
            'meta_description' => 'nullable',
            'meta_keywords' => 'nullable',
            'read_time' => 'nullable|max:20',
            'status' => 'nullable|in:active,inactive',
        ]);

        if ($validator->fails()) {
            return $this->apiResponse([
                'status' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $imagePath = null;
        if ($request->hasFile('image')) {
            $imagePath = '/storage/' . $request->file('image')->store('blogs', 'public');
        }

        $blog = Blog::create([
            'title' => $request->title,
            'slug' => $this->uniqueSlug($request->title),
            'category' => $request->category,
            'short_description' => $request->short_description,
            'content' => $request->content,
            'image' => $imagePath,
            'meta_title' => $request->meta_title,
            'meta_description' => $request->meta_description,
            'meta_keywords' => $request->meta_keywords,
            'read_time' => $request->read_time,
            'status' => $request->status ?? 'active',
        ]);

        return $this->apiResponse([
            'status' => true,
            'message' => 'Blog created successfully.',
            'data' => $blog,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $blog = Blog::find($id);

        if (!$blog) {
            return $this->apiResponse([
                'status' => false,
                'message' => 'Blog not found.',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'title' => 'required|max:255',
            'category' => 'nullable|max:100',
            'short_description' => 'nullable',
            'content' => 'nullable',
            'image' => 'nullable|image|mimes:jpg,jpeg,png,webp,gif|max:4096',
            'meta_title' => 'nullable|max:255',
            'meta_description' => 'nullable',
            'meta_keywords' => 'nullable',
            'read_time' => 'nullable|max:20',
            'status' => 'nullable|in:active,inactive',
        ]);

        if ($validator->fails()) {
            return $this->apiResponse([
                'status' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $imagePath = $blog->image;
        if ($request->hasFile('image')) {
            if ($blog->image && str_starts_with($blog->image, '/storage/')) {
                Storage::disk('public')->delete(str_replace('/storage/', '', $blog->image));
            }
            $imagePath = '/storage/' . $request->file('image')->store('blogs', 'public');
        }

        $blog->update([
            'title' => $request->title,
            'slug' => $this->uniqueSlug($request->title, $blog->id),
            'category' => $request->category,
            'short_description' => $request->short_description,
            'content' => $request->content,
            'image' => $imagePath,
            'meta_title' => $request->meta_title,
            'meta_description' => $request->meta_description,
            'meta_keywords' => $request->meta_keywords,
            'read_time' => $request->read_time,
            'status' => $request->status ?? 'active',
        ]);

        return $this->apiResponse([
            'status' => true,
            'message' => 'Blog updated successfully.',
            'data' => $blog,
        ]);
    }

    public function destroy($id)
    {
        $blog = Blog::find($id);

        if (!$blog) {
            return $this->apiResponse([
                'status' => false,
                'message' => 'Blog not found.',
            ], 404);
        }

        if ($blog->image && str_starts_with($blog->image, '/storage/')) {
            Storage::disk('public')->delete(str_replace('/storage/', '', $blog->image));
        }

        $blog->delete();

        return $this->apiResponse([
            'status' => true,
            'message' => 'Blog deleted successfully.',
        ]);
    }

    private function apiResponse(array $data, int $status = 200)
    {
        return response()->json($data, $status)
            ->header('Access-Control-Allow-Origin', '*')
            ->header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
            ->header('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Requested-With');
    }

    private function uniqueSlug(string $title, ?int $ignoreId = null): string
    {
        $baseSlug = Str::slug($title) ?: 'blog';
        $slug = $baseSlug;
        $counter = 2;

        while (
            Blog::where('slug', $slug)
                ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $slug = $baseSlug . '-' . $counter;
            $counter++;
        }

        return $slug;
    }
}

