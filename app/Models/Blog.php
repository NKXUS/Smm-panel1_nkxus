<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Blog extends Model
{
    protected $table = 'blogs_data';

    protected $fillable = [
        'title',
        'slug',
        'category',
        'short_description',
        'content',
        'image',
        'meta_title',
        'meta_description',
        'meta_keywords',
        'read_time',
        'status',
    ];
}