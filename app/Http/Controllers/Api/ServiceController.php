<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Service;
use Illuminate\Http\Request;

class ServiceController extends Controller
{
     public function createService(Request $request)
    {
        try {

            $service = Service::create([
                'category_id' => $request->category_id,
                'name' => $request->name,
                'rate_per_1000' => $request->rate_per_1000,
                'min_order' => $request->min_order,
                'max_order' => $request->max_order,
                'avg_time' => $request->avg_time,
                'description' => $request->description,
                'platform' => $request->platform,
                'is_active' => $request->is_active ?? true,
                'is_featured' => $request->is_featured ?? false,
            ]);

            return response()->json([
                'status' => true,
                'message' => 'Service created successfully',
                'data' => $service
            ], 201);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to create service',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // GET SERVICES WITH PAGINATION
    public function getServices(Request $request)
    {
        try {

            $query = Service::with('category')->latest();

            // Allows the Buy Now form to request only services belonging to
            // the category selected by the customer.
            if ($request->filled('category_id')) {
                $query->where('category_id', $request->integer('category_id'));
            }

            // The old page size of ten made the frontend issue hundreds of
            // requests for the imported catalog. A larger page keeps existing
            // pagination support while loading the dropdown promptly.
            $services = $query->paginate(1000);

            return response()->json([
                'status' => true,
                'message' => 'Services fetched successfully',
                'data' => $services
            ], 200);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to fetch services',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
