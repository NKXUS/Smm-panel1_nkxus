<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ServiceCategory;
use Illuminate\Http\Request;

class ServiceCategoryController extends Controller
{
   public function createCategory(Request $request)
    {
        try {

            $category = ServiceCategory::create([
                'name' => $request->name,
                'platform' => $request->platform,
                'icon_url' => $request->icon_url
            ]);

            return response()->json([
                'status' => true,
                'message' => 'Service category created successfully',
                'data' => $category
            ], 201);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to create service category',
                'error' => $e->getMessage()
            ], 500);
        }
    }
public function getCategories()
    {
        try {

            $categories = ServiceCategory::latest()->paginate(10);

            return response()->json([
                'status' => true,
                'message' => 'Service categories fetched successfully',
                'data' => $categories
            ], 200);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to fetch service categories',
                'error' => $e->getMessage()
            ], 500);
        }
    }
    public function getcategoryname()
{
    try {

        $categories = ServiceCategory::select('name')
            ->latest()
            ->paginate(10);

        return response()->json([
            'status' => true,
            'message' => 'Service categories fetched successfully',
            'data' => $categories
        ], 200);

    } catch (\Exception $e) {

        return response()->json([
            'status' => false,
            'message' => 'Failed to fetch service categories',
            'error' => $e->getMessage()
        ], 500);
    }
}
}
