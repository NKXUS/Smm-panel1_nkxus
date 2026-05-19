<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupportTicket extends Model
{
    protected $fillable = [
        'user_id',
        'order_id',
        'subject',
        'message',
        'email',
        'full_name',
        'status'
    ];

  public function user()
{
    return $this->belongsTo(SmmUser::class, 'user_id');
}

    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}